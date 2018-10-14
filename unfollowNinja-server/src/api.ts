import 'dotenv/config';

import * as bodyParser from 'body-parser';
import * as connectRedis from 'connect-redis';
import * as express from 'express';
import * as session from 'express-session';
import * as passport from 'passport';

import passportConfig from './api/passport-config';
import router from './api/router';
import logger, { setLoggerPrefix } from './utils/logger';

setLoggerPrefix('api');
passportConfig();

const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:2000/`;
const API_PORT = Number(process.env.API_PORT) || 2000;
const API_SESSION_SECRET = process.env.API_SESSION_SECRET || 'session_secret';
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const RedisStore = connectRedis(session);
app.use(session({
    store: new RedisStore({}),
    secret: API_SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: API_BASE_URL.startsWith('https://'), domain: COOKIE_DOMAIN },
}));

app.use(passport.initialize());
app.use(passport.session());

app.use('/v1', router);
app.listen(API_PORT);
logger.info(`Unfollow ninja API is now listening on port ${API_PORT}`);
