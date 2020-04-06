import { ApolloError } from 'apollo-server';
import { OAuth } from 'oauth';
import logger from '../utils/logger';

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

const tokenToSecret = {};

const Query = {
    me(_, args, { session }) {
        return session.user;
    },

    twitterStep1AuthUrl(_, _args, { session, setSession }) {
        if (session.user) {
            return null;
        }
        return new Promise((resolve, reject) => {
            step1Twit.getOAuthRequestToken((error, oauthToken, oauthTokenSecret) => {
                if (error) {
                    reject(error);
                } else {
                    session.tokenToSecret = session.tokenToSecret || {};
                    session.tokenToSecret[oauthToken] = oauthTokenSecret;
                    setSession(session)
                        .then(() => resolve('https://twitter.com/oauth/authenticate?oauth_token=' + oauthToken))
                        .catch(reject);
                }
            });
        });
    },

    twitterStep2AuthUrl(_, _args, { session, setSession }) {
        if (!session.user) {
            return null;
        }
        return new Promise((resolve, reject) => {
            step2Twit.getOAuthRequestToken((error, oauthToken, oauthTokenSecret) => {
                if (error) {
                    reject(error);
                } else {
                    session.tokenToSecret = session.tokenToSecret || {};
                    session.tokenToSecret[oauthToken] = oauthTokenSecret;
                    setSession(session)
                        .then(() => resolve('https://twitter.com/oauth/authenticate?oauth_token=' + oauthToken))
                        .catch(reject);
                }
            });
        });
    },

    async info(_, _args, context) {
        const [ user, twitterStep1AuthUrl, twitterStep2AuthUrl ] = await Promise.all([
            Query.me(null, null, context), Query.twitterStep1AuthUrl(null, null, context), Query.twitterStep2AuthUrl(null, null, context)
        ]);
        return { id: 0, user, twitterStep1AuthUrl, twitterStep2AuthUrl }
    },
};

const Mutation = {
    async login(_, { token, verifier }, { session, setSession }) {
        const secret = session.tokenToSecret?.[token];
        delete session.tokenToSecret?.[token];
        if (!secret) {
            throw new ApolloError('Session lost, please try again');
        }
        const user: Record<string, string> = await new Promise((resolve, reject) => {
            step1Twit.getOAuthAccessToken(token, secret, verifier,
                (error, oauthAccessToken, oauthAccessTokenSecret) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    step1Twit.get('https://api.twitter.com/1.1/account/verify_credentials.json', oauthAccessToken,
                        oauthAccessTokenSecret, (error2, data) => {
                            if (error2) {
                                reject(error2);
                            } else {
                                const jsonData = JSON.parse(data.toString());
                                resolve({
                                    token: oauthAccessToken,
                                    secret: oauthAccessTokenSecret,
                                    username: jsonData.screen_name,
                                    id: jsonData.id_str,
                                });
                            }
                        });
                });
        });
        session.user = {...user};
        await setSession(session);
        return await Query.info(null, null, { session, setSession});
    },
    async addDmAccount(_, { token, verifier }, { session, setSession }) {
        const secret = session.tokenToSecret?.[token];
        delete session.tokenToSecret?.[token];
        if (!secret) {
            throw new ApolloError('Session lost, please try again');
        }
        await new Promise((resolve, reject) => {
            step1Twit.getOAuthAccessToken(token, secret, verifier,
                (error, oauthAccessToken, oauthAccessTokenSecret) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    step2Twit.get('https://api.twitter.com/1.1/account/verify_credentials.json', oauthAccessToken,
                        oauthAccessTokenSecret, (error2, data) => {
                            if (error2) {
                                reject(error2);
                            } else {
                                const jsonData = JSON.parse(data.toString());
                                session.user = {
                                    ...session.user,
                                    dmAccountUsername: jsonData.screen_name,
                                };
                                resolve();
                            }
                        });
                });
        });
        await setSession(session);
        return session.user;
    },
    async removeDmAccount(_, _args, { session, setSession }) {
        delete session.user.dmAccountUsername;
        await setSession(session);
        return session.user;
    },
    async logout(_, _args, { setSession }) {
        await setSession({});
        return await Query.info(null, null, { session: {}, setSession });
    },
};

export default {
    Query,
    Mutation,
};
