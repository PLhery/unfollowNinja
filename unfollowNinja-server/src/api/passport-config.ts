import * as passport from 'passport';
import {Strategy as TwitterStrategy} from 'passport-twitter';
import { URL } from 'url';
import Dao, {UserCategory} from '../dao/dao';
import logger from '../utils/logger';
import {IUserParams} from '../utils/types';

if (!process.env.CONSUMER_KEY || !process.env.CONSUMER_SECRET) {
    logger.error('Some required environment variables are missing (CONSUMER_KEY / CONSUMER_SECRET).');
    logger.error('Make sure you added them in a .env file in you cwd or that you defined them.');
    process.exit();
}
if (!process.env.DM_CONSUMER_KEY || !process.env.DM_CONSUMER_SECRET) {
    logger.error('Some required environment variables are missing (DM_CONSUMER_KEY / DM_CONSUMER_SECRET).');
    logger.error('Make sure you added them in a .env file in you cwd or that you defined them.');
    process.exit();
}
const { CONSUMER_KEY, CONSUMER_SECRET, DM_CONSUMER_KEY, DM_CONSUMER_SECRET } = process.env;
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:2000/`;

export default function passportConfig() {
    passport.use(new TwitterStrategy({
            consumerKey: CONSUMER_KEY,
            consumerSecret: CONSUMER_SECRET,
            callbackURL: new URL('v1/auth', API_BASE_URL).toString(),
        },
        (token, tokenSecret, profile, cb) => {
            const { id, username, photos } = profile;
            const user = { id, username, photo: photos[0].value, token, tokenSecret };
            cb(null, user);
        },
    ));

    passport.use('twitter-dm', new TwitterStrategy({
            consumerKey: DM_CONSUMER_KEY,
            consumerSecret: DM_CONSUMER_SECRET,
            callbackURL: new URL('v1/auth-dm-app', API_BASE_URL).toString(),
        },
        (token, tokenSecret, profile, cb) => {
            const { id, username, photos } = profile;
            const user = { id, username, photo: photos[0].value, token, tokenSecret };
            cb(null, user);
        },
    ));
}

const dao = new Dao();
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser(async (user: any, done) => {
    const { id, token, tokenSecret, username, photo } = user;
    let params: IUserParams = await dao.getUserDao(id).getUserParams();
    if (typeof params.token === 'undefined') { // new user
        params = {
            added_at: Date.now(),
            lang: 'fr',
            photo,
            token,
            tokenSecret,
        };
        await dao.addUser({
            category: UserCategory.disabled,
            id,
            username,
            ...params,
        });
    } else if (params.tokenSecret !== tokenSecret) {
        await dao.getUserDao(id).setTokens(token, tokenSecret);
    }
    done(null, {...user, ...params});
});
