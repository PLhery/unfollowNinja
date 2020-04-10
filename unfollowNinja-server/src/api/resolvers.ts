import { ApolloError, AuthenticationError } from 'apollo-server';
import { OAuth } from 'oauth';
import { promisify } from 'util';
import type { Queue } from 'kue';

import logger from '../utils/logger';
import Dao, { UserCategory } from '../dao/dao';
import { getOauthUrl, getOauthUser } from './oauth-manager';
import type { Session } from '../utils/types';

if (!process.env.CONSUMER_KEY || !process.env.CONSUMER_SECRET ||
    !process.env.DM_CONSUMER_KEY || !process.env.DM_CONSUMER_SECRET || !process.env.WEB_URL) {
    logger.error('Some required environment variables are missing ((DM_)CONSUMER_KEY/CONSUMER_SECRET/WEB_URL).');
    logger.error('Make sure you added them in a .env file in you cwd or that you defined them.');
    process.exit();
}

const step1Twit = new OAuth('https://twitter.com/oauth/request_token', 'https://twitter.com/oauth/access_token',
    process.env.CONSUMER_KEY, process.env.CONSUMER_SECRET, '1.0A', process.env.WEB_URL + '/1', 'HMAC-SHA1');

const step2Twit = new OAuth('https://twitter.com/oauth/request_token', 'https://twitter.com/oauth/access_token',
    process.env.DM_CONSUMER_KEY, process.env.DM_CONSUMER_SECRET, '1.0A', process.env.WEB_URL + '/2', 'HMAC-SHA1');

export interface Context {
    session: Session;
    setSession: (data: Session) => Promise<void>;
    dao: Dao;
    queue?: Queue
}
type resolver = Record<string, (_: any, args: any, context: Context) => any>;

const Query: resolver = {
    me(_, args, { session }) {
        return session.user;
    },

    twitterStep1AuthUrl(_, _args, { session, setSession }) {
        if (session.user) {
            return null;
        }
        return getOauthUrl(step1Twit, session, setSession);
    },

    twitterStep2AuthUrl(_, _args, { session, setSession }) {
        if (!session.user) {
            return null;
        }
        return getOauthUrl(step2Twit, session, setSession);
    },

    async info(_, _args, context) {
        const [ user, twitterStep1AuthUrl, twitterStep2AuthUrl ] = await Promise.all([
            Query.me(null, null, context), Query.twitterStep1AuthUrl(null, null, context), Query.twitterStep2AuthUrl(null, null, context)
        ]);
        return { id: 0, user, twitterStep1AuthUrl, twitterStep2AuthUrl }
    },
};

const Mutation: resolver = {
    async login(_, { token, verifier }, { session, setSession, dao }) {
        const secret = session.tokenToSecret?.[token];
        if (!secret) {
            throw new ApolloError('Session lost, please try again');
        }
        delete session.tokenToSecret[token];
        const user = await getOauthUser(step1Twit, token, secret, verifier);
        let [params, category] = await Promise.all([
            dao.getUserDao(user.id).getUserParams(),
            dao.getUserDao(user.id).getCategory(),
            dao.addTwittoToCache({id: user.id, username: user.username}),
        ]);
        if (!params.token) { // params = {}
            params = {
                added_at: Date.now(),
                lang: 'fr',
                token: user.token,
                tokenSecret: user.secret,
            };
            await dao.addUser({
                category: UserCategory.disabled,
                id: user.id,
                username: user.username,
                ...params,
            });
        } else if (params.tokenSecret !== user.secret) { // after a revoked token
            await dao.getUserDao(user.id).setUserParams({token: user.token, tokenSecret: user.secret});
        }
        session.user = {...params, id: user.id, username: user.username, category};
        if (params.dmId) {
            session.user.dmUsername = await dao.getCachedUsername(params.dmId);
        }

        await setSession(session);
        return await Query.info(null, null, { session, setSession, dao });
    },

    async addDmAccount(_, { token, verifier }, { session, setSession, dao, queue }) {
        if (!session.user) {
            throw new AuthenticationError('you must be logged in to do this action');
        }
        const secret = session.tokenToSecret?.[token];
        if (!secret) {
            throw new ApolloError('Session lost, please try again');
        }
        delete session.tokenToSecret[token];
        const dmUser = await getOauthUser(step2Twit, token, secret, verifier);
        session.user = {
            ...session.user,
            dmId: dmUser.id,
            dmUsername: dmUser.username,
            category: UserCategory.enabled,
        };
        await Promise.all([
            dao.getUserDao(session.user.id).setUserParams({
                dmId: dmUser.id,
                dmToken: dmUser.token,
                dmTokenSecret: dmUser.secret,
            }),
            dao.getUserDao(session.user.id).setCategory(UserCategory.enabled),
            dao.addTwittoToCache({id: dmUser.id, username: dmUser.username}),
            setSession(session),
        ]);
        await promisify((cb) =>
            queue
                .create('sendWelcomeMessage', {
                    userId: session.user.id,
                    username: session.user.username,
                })
                .removeOnComplete(true)
                .save(cb),
        )();
        return session.user;
    },

    async removeDmAccount(_, _args, { session, setSession, dao }) {
        delete session.user.dmId;
        delete session.user.dmUsername;
        await Promise.all([
            dao.getUserDao(session.user.id).setCategory(UserCategory.disabled),
            dao.getUserDao(session.user.id).setUserParams({
                dmId: null,
                dmPhoto: null,
                dmToken: null,
                dmTokenSecret: null,
            }),
            setSession(session),
        ]);
        return session.user;
    },

    async logout(_, _args, { setSession, dao }) {
        await setSession({});
        return await Query.info(null, null, { session: {}, setSession, dao });
    },
};

export default {
    Query,
    Mutation,
};
