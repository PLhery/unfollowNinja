import TwitterApi from 'twitter-api-v2';
import Router from 'koa-router';
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

/*const _STEP1_CREDENTIALS = {
    appKey: process.env.CONSUMER_KEY,
    appSecret: process.env.CONSUMER_SECRET,
} as const;*/
const _STEP2_CREDENTIALS = {
    appKey: process.env.DM_CONSUMER_KEY,
    appSecret: process.env.DM_CONSUMER_SECRET,
} as const;
const _STEP1_CREDENTIALS = _STEP2_CREDENTIALS;

if (!process.env.API_URL || !process.env.WEB_URL) {
    logger.error('Some required environment variables are missing (API_URL/WEB_URL).');
    logger.error('Make sure you added them in a .env file in you cwd or that you defined them.');
    process.exit();
}

const DEFAULT_LANGUAGE = (process.env.DEFAULT_LANGUAGE || 'en') as Lang;

export function createAuthRouter(dao: Dao) {
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
                // params = {} => the user doesn't exist, let's create it
                params = {
                    added_at: Date.now(),
                    lang: DEFAULT_LANGUAGE,
                    token: loginResult.accessToken,
                    tokenSecret: loginResult.accessSecret,
                    isTemporarySecondAppToken: true,
                    dmId: loginResult.userId,
                    dmToken: loginResult.accessToken,
                    dmTokenSecret: loginResult.accessSecret,
                };
                await dao.addUser({
                    category,
                    id: loginResult.userId,
                    username: loginResult.screenName,
                    ...params,
                });

                void dao.userEventDao.logWebEvent(
                    loginResult.userId,
                    WebEvent.createAccount,
                    ctx.ip,
                    loginResult.screenName
                );
                void dao.userEventDao.logWebEvent(
                    loginResult.userId,
                    WebEvent.addedAsSomeonesDmAccount,
                    ctx.ip,
                    loginResult.screenName,
                    loginResult.userId
                );

                category = await dao.getUserDao(loginResult.userId).enable();
            } else {
                // not a new user
                if (params.tokenSecret !== loginResult.accessSecret || !params.isTemporarySecondAppToken) {
                    // after a revoked token => refresh the token
                    await dao.getUserDao(loginResult.userId).setUserParams({
                        token: loginResult.accessToken,
                        tokenSecret: loginResult.accessSecret,
                        isTemporarySecondAppToken: true,
                    });
                }

                // if the user has a DM token, we check if it's the same as the one we have, if not we add it
                if (
                    !params.dmId ||
                    (params.dmId === loginResult.userId && params.dmTokenSecret !== loginResult.accessSecret)
                ) {
                    await dao.getUserDao(loginResult.userId).setUserParams({
                        dmId: loginResult.userId,
                        dmToken: loginResult.accessToken,
                        dmTokenSecret: loginResult.accessSecret,
                    });
                    void dao.userEventDao.logWebEvent(
                        loginResult.userId,
                        WebEvent.addedAsSomeonesDmAccount,
                        ctx.ip,
                        loginResult.screenName,
                        loginResult.userId
                    );
                    category = await dao.getUserDao(loginResult.userId).enable();
                }
            }
            const session = ctx.session as NinjaSession;
            session.userId = loginResult.userId;
            session.username = loginResult.screenName;

            const twitterApi = new TwitterApi({
                accessToken: loginResult.accessToken,
                accessSecret: loginResult.accessSecret,
                appKey: process.env.DM_CONSUMER_KEY,
                appSecret: process.env.DM_CONSUMER_SECRET,
            });
            const result = await twitterApi.v2.me({ 'user.fields': ['profile_image_url'] });
            session.profilePic = result.data.profile_image_url.replace('_normal', '_bigger');
            session.fullName = result.data.name;

            void dao.userEventDao.logWebEvent(loginResult.userId, WebEvent.signIn, ctx.ip, loginResult.screenName);
            const country = geoip.lookup(ctx.ip)?.country;
            const msgContent = encodeURI(
                JSON.stringify({
                    userId: loginResult.userId,
                    username: loginResult.screenName,
                    fullName: session.fullName,
                    category,
                    lang: params.lang,
                    country,
                    profilePic: session.profilePic,
                })
            );

            ctx.type = 'html';
            ctx.body = `You successfully logged in! closing this window...
      <script>
        window.opener && window.opener.postMessage({msg: 'step1', content: "${msgContent}"}, '${process.env.WEB_URL}');
        close();
      </script>`;
        });
}
