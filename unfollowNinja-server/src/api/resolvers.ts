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

    twitterStep1AuthUrl(_, args, context) {
        if (uidToUser[context.uid]) {
            return null;
        }
        return new Promise((resolve, reject) => {
            step1Twit.getOAuthRequestToken((error, oauthToken, oauthTokenSecret) => {
                if (error) {
                    reject(error);
                } else {
                    tokenToSecret[oauthToken] = oauthTokenSecret;
                    resolve('https://twitter.com/oauth/authorize?oauth_token=' + oauthToken);
                }
            });
        });
    },

    twitterStep2AuthUrl(_, args, context) {
        if (!uidToUser[context.uid]) {
            return null;
        }
        return new Promise((resolve, reject) => {
            step2Twit.getOAuthRequestToken((error, oauthToken, oauthTokenSecret) => {
                if (error) {
                    reject(error);
                } else {
                    tokenToSecret[oauthToken] = oauthTokenSecret;
                    resolve('https://twitter.com/oauth/authorize?oauth_token=' + oauthToken);
                }
            });
        });
    },
};

const Mutation = {
    async login(_, { token, verifier }, context) {
        if (!uidToUser[context.uid]) {
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
        }
        const [twitterStep2AuthUrl, me] = await Promise.all(
            [Query.twitterStep2AuthUrl(null, null, context), Query.me(null, null, context)],
        );
        return { twitterStep2AuthUrl, me };
    },
};

export default {
    Query,
    Mutation,
};
