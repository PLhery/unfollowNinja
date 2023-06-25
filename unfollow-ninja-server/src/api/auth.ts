import TwitterApi from 'twitter-api-v2';
import Router from 'koa-router';
import geoip from 'geoip-country';

import logger from '../utils/logger';
import type Dao from '../dao/dao';
import type { NinjaSession } from '../api';
import { Lang } from '../utils/types';
import { WebEvent } from '../dao/userEventDao';

const authRouter = new Router();

if (!process.env.CONSUMER_KEY || !process.env.CONSUMER_SECRET) {
    logger.error('Some required environment variables are missing ((DM_)CONSUMER_KEY/CONSUMER_SECRET).');
    logger.error('Make sure you added them in a .env file in you cwd or that you defined them.');
    process.exit();
}

const _STEP1_CREDENTIALS = {
    appKey: process.env.CONSUMER_KEY,
    appSecret: process.env.CONSUMER_SECRET,
} as const;
const _DM_CREDENTIALS = {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
} as const;

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

            const twitterApi = new TwitterApi({
                accessToken: loginResult.accessToken,
                accessSecret: loginResult.accessSecret,
                appKey: process.env.CONSUMER_KEY,
                appSecret: process.env.CONSUMER_SECRET,
            });
            const result = await twitterApi.v2.me({ 'user.fields': ['profile_image_url'] });

            const session = ctx.session as NinjaSession;
            if (session.userId && session.userId !== loginResult.userId) {
                session.otherProfiles = session.otherProfiles || {};
                session.otherProfiles[session.userId] = {
                    userId: session.userId,
                    username: session.username,
                    profilePic: session.profilePic,
                    fullName: session.fullName,
                };
            }
            session.userId = loginResult.userId;
            session.username = loginResult.screenName;
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
                    hasNotificationsEnabled: params.dmLastEventId !== 0,
                    otherProfiles: Object.values(session.otherProfiles || {}),
                })
            );

            delete ctx.session.twitterTokenSecret;
            ctx.type = 'html';
            ctx.body = `You successfully logged in! closing this window...
      <script>
        window.opener && window.opener.postMessage({msg: 'step1', content: "${msgContent}"}, '${process.env.WEB_URL}');
        close();
      </script>`;
        })
        .get('/dm-auth', async (ctx) => {
            // Generate an authentication URL
            const { url, state, codeVerifier } = await new TwitterApi(_DM_CREDENTIALS).generateOAuth2AuthLink(
                process.env.API_URL + '/auth/dm-auth-callback',
                { scope: ['dm.write', 'tweet.read', 'users.read', 'offline.access'] }
            );

            const session = ctx.session as NinjaSession;
            // store the relevant information in the session
            session.twitterCodeVerifier = ctx.session.twitterCodeVerifier || {};
            session.twitterCodeVerifier[state] = codeVerifier;

            // redirect to the authentication URL
            ctx.redirect(url);
        })
        .get('/dm-auth-callback', async (ctx) => {
            const { state, code } = ctx.query;
            if (typeof state !== 'string' || typeof code !== 'string') {
                ctx.body = { status: 'Oops, it looks like you refused to log in..' };
                ctx.status = 401;
                return;
            }
            const codeVerifier = (ctx.session as NinjaSession).twitterCodeVerifier?.[state];
            if (typeof codeVerifier !== 'string') {
                ctx.body = {
                    status: 'Oops, it looks like your session has expired.. Try again!',
                };
                ctx.status = 401;
                return;
            }

            const { client, accessToken, refreshToken } = await new TwitterApi(_DM_CREDENTIALS).loginWithOAuth2({
                code,
                codeVerifier,
                redirectUri: process.env.API_URL + '/auth/dm-auth-callback',
            });

            const { id } = (await client.v2.me()).data;
            if (id !== ctx.session.userId) {
                ctx.body = { status: 'Oops, it looks like you logged in with the wrong account..' };
                ctx.status = 401;
                return;
            }
            await dao.getUserDao(id).setUserParams({ dmRefreshToken: refreshToken });
            ctx.status = 200;
            ctx.body = 'You successfully logged in!';
        })
        .post('/set-profile', async (ctx) => {
            const session = ctx.session as NinjaSession;
            const id = ctx.request['body']?.['userId'];
            if (!id || typeof id !== 'string' || session.otherProfiles?.[id] === undefined) {
                ctx.body = { status: 'Oops, something went wrong.. Try again!' };
                ctx.status = 401;
                return;
            }
            session.otherProfiles[session.userId] = {
                userId: session.userId,
                username: session.username,
                profilePic: session.profilePic,
                fullName: session.fullName,
            };
            session.userId = session.otherProfiles[id].userId;
            session.username = session.otherProfiles[id].username;
            session.profilePic = session.otherProfiles[id].profilePic;
            session.fullName = session.otherProfiles[id].fullName;
            delete session.otherProfiles[id];

            const [params, category] = await Promise.all([
                dao.getUserDao(session.userId).getUserParams(),
                dao.getUserDao(session.userId).getCategory(),
            ]);
            const country = geoip.lookup(ctx.ip)?.country;
            ctx.body = {
                userId: session.userId,
                username: session.username,
                fullName: session.fullName,
                category,
                lang: params.lang,
                country,
                profilePic: session.profilePic,
                hasNotificationsEnabled: params.dmLastEventId !== 0,
                otherProfiles: Object.values(session.otherProfiles || {}),
            };
        });
}
