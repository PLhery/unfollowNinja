import TwitterApi from 'twitter-api-v2';
import Router from 'koa-router';
import type { Queue } from 'bull';
import geoip from 'geoip-country';

import logger from '../utils/logger';
import type Dao from '../dao/dao';
import { UserCategory } from '../dao/dao';
import type { NinjaSession } from '../api';
import { Lang } from '../utils/types';
import { WebEvent } from '../dao/userEventDao';
import { getPriceTags } from './stripe';

const authRouter = new Router();

if (
    !process.env.CONSUMER_KEY ||
    !process.env.CONSUMER_SECRET ||
    !process.env.DM_CONSUMER_KEY ||
    !process.env.DM_CONSUMER_SECRET
) {
    logger.error('Some required environment variables are missing ((DM_)CONSUMER_KEY/CONSUMER_SECRET).');
    logger.error('Make sure you added them in a .env file in you cwd or that you defined them.');
    process.exit();
}

const _STEP1_CREDENTIALS = {
    appKey: process.env.CONSUMER_KEY,
    appSecret: process.env.CONSUMER_SECRET,
} as const;
const _STEP2_CREDENTIALS = {
    appKey: process.env.DM_CONSUMER_KEY,
    appSecret: process.env.DM_CONSUMER_SECRET,
} as const;

if (!process.env.API_URL || !process.env.WEB_URL) {
    logger.error('Some required environment variables are missing (API_URL/WEB_URL).');
    logger.error('Make sure you added them in a .env file in you cwd or that you defined them.');
    process.exit();
}

const DEFAULT_LANGUAGE = (process.env.DEFAULT_LANGUAGE || 'en') as Lang;

export function createAuthRouter(dao: Dao, queue: Queue) {
    return authRouter
        .get('/step-1', async (ctx) => {
            // Generate an authentication URL
            const { url, oauth_token, oauth_token_secret } = await new TwitterApi(_STEP1_CREDENTIALS).generateAuthLink(
                process.env.API_URL + '/auth/step-1-callback'
            );

            const session = ctx.session as NinjaSession;
            // store the relevant information in the session
            session.twitterTokenSecret = ctx.session.twitterTokenSecret || {};
            session.twitterTokenSecret[oauth_token] = oauth_token_secret;

            // redirect to the authentication URL
            ctx.redirect(url);
        })
        .get('/step-1-callback', async (ctx) => {
            // check query params and session data
            const { oauth_token, oauth_verifier } = ctx.query;
            if (typeof oauth_token !== 'string' || typeof oauth_verifier !== 'string') {
                ctx.body = { status: 'Oops, it looks like you refused to log in..' };
                ctx.status = 401;
                return;
            }
            const oauthTokenSecret = ctx.session.twitterTokenSecret?.[oauth_token];
            if (typeof oauthTokenSecret !== 'string') {
                ctx.body = {
                    status: 'Oops, it looks like your session has expired.. Try again!',
                };
                ctx.status = 401;
                return;
            }

            // fetch the token / secret / account infos (from the temporary one)
            const loginResult = await new TwitterApi({
                ..._STEP1_CREDENTIALS,
                accessToken: oauth_token,
                accessSecret: oauthTokenSecret,
            }).login(oauth_verifier);

            // fetch user info (and refresh the username cache)
            let [params, category] = await Promise.all([
                dao.getUserDao(loginResult.userId).getUserParams(),
                dao.getUserDao(loginResult.userId).getCategory(),
                dao.addTwittoToCache({
                    id: loginResult.userId,
                    username: loginResult.screenName,
                }),
            ]);

            if (!params.token) {
                // params = {} => the user doesn't exists, let's create it
                params = {
                    added_at: Date.now(),
                    lang: DEFAULT_LANGUAGE,
                    token: loginResult.accessToken,
                    tokenSecret: loginResult.accessSecret,
                };
                category = UserCategory.disabled;
                await dao.addUser({
                    category,
                    id: loginResult.userId,
                    username: loginResult.screenName,
                    ...params,
                });

                dao.userEventDao.logWebEvent(
                    loginResult.userId,
                    WebEvent.createAccount,
                    ctx.ip,
                    loginResult.screenName
                );
            } else {
                // not a new user
                if (params.tokenSecret !== loginResult.accessSecret) {
                    // after a revoked token => refresh the token
                    await dao.getUserDao(loginResult.userId).setUserParams({
                        token: loginResult.accessToken,
                        tokenSecret: loginResult.accessSecret,
                    });
                }
            }
            const session = ctx.session as NinjaSession;
            session.userId = loginResult.userId;
            session.username = loginResult.screenName;

            dao.userEventDao.logWebEvent(loginResult.userId, WebEvent.signIn, ctx.ip, loginResult.screenName);
            const country = geoip.lookup(ctx.ip)?.country;
            const msgContent = encodeURI(
                JSON.stringify({
                    userId: loginResult.userId,
                    username: loginResult.screenName,
                    dmUsername:
                        params.dmId && [UserCategory.enabled, UserCategory.vip].includes(category)
                            ? await dao.getCachedUsername(params.dmId)
                            : null,
                    category,
                    lang: params.lang,
                    country,
                    priceTags: getPriceTags(country),
                    isPro: Number(params.pro) > 0,
                    friendCodes:
                        params.pro === '2' ? await dao.getUserDao(session.userId).getFriendCodesWithUsername() : null,
                    hasSubscription: Boolean(params.customerId),
                })
            );

            ctx.type = 'html';
            ctx.body = `You successfully logged in! closing this window...
      <script>
        window.opener && window.opener.postMessage({msg: 'step1', content: "${msgContent}"}, '${process.env.WEB_URL}');
        close();
      </script>`;
        })
        .get('/step-2', async (ctx) => {
            // Generate an authentication URL
            const forceLogin = Boolean(ctx.query.force_login);
            const { url, oauth_token, oauth_token_secret } = await new TwitterApi(_STEP2_CREDENTIALS).generateAuthLink(
                process.env.API_URL + '/auth/step-2-callback',
                {
                    forceLogin,
                }
            );

            // store the relevant information in the session
            const session = ctx.session as NinjaSession;
            session.twitterTokenSecret = ctx.session.twitterTokenSecret || {};
            session.twitterTokenSecret[oauth_token] = oauth_token_secret;

            // redirect to the authentication URL
            ctx.redirect(url);
        })
        .get('/step-2-callback', async (ctx) => {
            // check query params and session data
            const { oauth_token, oauth_verifier } = ctx.query;
            if (typeof oauth_token !== 'string' || typeof oauth_verifier !== 'string') {
                ctx.body = { status: 'Oops, it looks like you refused to log in..' };
                ctx.status = 401;
                return;
            }

            const session = ctx.session as NinjaSession;
            const oauthTokenSecret = session.twitterTokenSecret?.[oauth_token];
            const userId = session.userId;
            if (typeof oauthTokenSecret !== 'string' || typeof userId !== 'string') {
                ctx.body = {
                    status: 'Oops, it looks like your session has expired.. Try again!',
                };
                ctx.status = 401;
                return;
            }

            // fetch the token / secret / account infos (from the temporary one)
            const loginResult = await new TwitterApi({
                ..._STEP2_CREDENTIALS,
                accessToken: oauth_token,
                accessSecret: oauthTokenSecret,
            }).login(oauth_verifier);

            // Add info about the DM account to the user's params
            await Promise.all([
                dao.getUserDao(userId).setUserParams({
                    dmId: loginResult.userId,
                    dmToken: loginResult.accessToken,
                    dmTokenSecret: loginResult.accessSecret,
                }),
                dao.addTwittoToCache({
                    id: loginResult.userId,
                    username: loginResult.screenName,
                }),
            ]);
            const category = await dao.getUserDao(userId).enable();

            dao.userEventDao.logWebEvent(
                userId,
                WebEvent.addDmAccount,
                ctx.ip,
                loginResult.screenName,
                loginResult.userId
            );
            if (userId !== loginResult.userId) {
                dao.userEventDao.logWebEvent(
                    loginResult.userId,
                    WebEvent.addedAsSomeonesDmAccount,
                    ctx.ip,
                    session.username,
                    userId
                );
            }

            await queue.add(
                'sendWelcomeMessage',
                {
                    id: Date.now(), // otherwise some seem stuck??
                    userId,
                    username: ctx.session.username,
                },
                { delay: 500 }
            ); // otherwise it looks like it weirdly may start before setUserParams finished :/

            const params = await dao.getUserDao(session.userId).getUserParams();
            const country = geoip.lookup(ctx.ip)?.country;
            const msgContent = encodeURI(
                JSON.stringify({
                    userId: session.userId,
                    username: session.username,
                    dmUsername: loginResult.screenName,
                    category,
                    lang: params.lang,
                    country,
                    priceTags: getPriceTags(country),
                    isPro: Number(params.pro) > 0,
                    friendCodes:
                        params.pro === '2' ? await dao.getUserDao(session.userId).getFriendCodesWithUsername() : null,
                    hasSubscription: Boolean(params.customerId),
                })
            );

            ctx.type = 'html';
            ctx.body = `You successfully logged in! closing this window...
      <script>
        window.opener && window.opener.postMessage({msg: 'step2', content: "${msgContent}"}, '${process.env.WEB_URL}');
        close();
      </script>`;
        });
}
