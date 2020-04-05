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
const uidToUser = {};

const Query = {
    me(_, args, context) {
        return uidToUser[context.uid] || null;
    },

    twitterStep1AuthUrl(_, _args, context) {
        if (uidToUser[context.uid]) {
            return null;
        }
        return new Promise((resolve, reject) => {
            step1Twit.getOAuthRequestToken((error, oauthToken, oauthTokenSecret) => {
                if (error) {
                    reject(error);
                } else {
                    tokenToSecret[oauthToken] = oauthTokenSecret;
                    resolve('https://twitter.com/oauth/authenticate?oauth_token=' + oauthToken);
                }
            });
        });
    },

    twitterStep2AuthUrl(_, _args, context) {
        if (!uidToUser[context.uid]) {
            return null;
        }
        return new Promise((resolve, reject) => {
            step2Twit.getOAuthRequestToken((error, oauthToken, oauthTokenSecret) => {
                if (error) {
                    reject(error);
                } else {
                    tokenToSecret[oauthToken] = oauthTokenSecret;
                    resolve('https://twitter.com/oauth/authenticate?oauth_token=' + oauthToken);
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
    async login(_, { token, verifier }, context) {
        const secret = tokenToSecret[token];
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
                    step1Twit.get('https://api.twitter.com/1.1/account/verify_credentials.json', oauthAccessToken,
                        oauthAccessTokenSecret, (error2, data) => {
                            if (error2) {
                                reject(error2);
                            } else {
                                const jsonData = JSON.parse(data.toString());
                                uidToUser[context.uid] = {
                                    token: oauthAccessToken,
                                    secret: oauthAccessTokenSecret,
                                    username: jsonData.screen_name,
                                    id: jsonData.id_str,
                                };
                                resolve();
                            }
                        });
                });
        });
        return await Query.info(null, null, context);
    },
    async addDmAccount(_, { token, verifier }, context) {
        const secret = tokenToSecret[token];
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
                                uidToUser[context.uid] = {
                                    ...uidToUser[context.uid],
                                    dmAccountUsername: jsonData.screen_name,
                                };
                                resolve();
                            }
                        });
                });
        });
        return uidToUser[context.uid];
    },
    async removeDmAccount(_, _args, context) {
        delete uidToUser[context.uid].dmAccountUsername;
        return uidToUser[context.uid]
    },
    async logout(_, _args, context) {
        delete uidToUser[context.uid];
        return await Query.info(null, null, context);
    },
};

export default {
    Query,
    Mutation,
};
