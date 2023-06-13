import 'dotenv/config';

import * as Sentry from '@sentry/node';
import '@sentry/tracing';
import Koa from 'koa';
import Router from 'koa-router';
import koaSession from 'koa-session';
import koaBodyParser from 'koa-bodyparser';
import koaCors from '@koa/cors';
import geoip from 'geoip-country';

import Dao, { UserCategory } from './dao/dao';
import logger, { setLoggerPrefix } from './utils/logger';
import { createAuthRouter } from './api/auth';
import { createAdminRouter } from './api/admin';
import { createUserRouter } from './api/user';
import { handleWebhook } from './api/stripe';

function assertEnvVariable(name: string) {
    if (typeof process.env[name] === 'undefined') {
        logger.error(`Some required environment variables are missing (${name}).`);
        logger.error('Make sure you added them in a .env file in you cwd or that you defined them.');
        process.exit();
    }
}
assertEnvVariable('WEB_URL');
assertEnvVariable('COOKIE_SIGNING_KEY');

setLoggerPrefix('api');

const SENTRY_DSN = process.env.SENTRY_DSN_API || undefined;
if (SENTRY_DSN) {
    Sentry.init({ dsn: SENTRY_DSN, tracesSampleRate: 0.1 });
}

assertEnvVariable('REDIS_URI');
assertEnvVariable('POSTGRES_URI');
const dao = new Dao();

const authRouter = createAuthRouter(dao);
const userRouter = createUserRouter(dao);
const adminRouter = createAdminRouter(dao);

export interface NinjaSession {
    twitterTokenSecret?: Record<string, string>;
    userId?: string;
    username?: string;
    profilePic?: string;
    fullName?: string;
}

const router = new Router()
    .get('/', (ctx) => {
        ctx.body = { status: 'ᕕ( ᐛ )ᕗ Hello, fellow human' };
    })
    .get('/robots.txt', (ctx) => {
        ctx.body = 'User-agent: *\nDisallow: /';
    })
    .use('/auth', authRouter.routes(), authRouter.allowedMethods())
    .use('/admin', adminRouter.routes(), adminRouter.allowedMethods())
    .all(
        '/(.*)',
        koaCors({
            // only routes below are allowed for CORS
            origin: process.env.WEB_URL,
            credentials: true,
        })
    )
    .use('/user', userRouter.routes(), userRouter.allowedMethods())
    .get('/get-status', async (ctx) => {
        const session = ctx.session as NinjaSession;
        if (!session.userId) {
            ctx.body = {
                country: geoip.lookup(ctx.ip)?.country,
            };
        } else {
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
            };
        }
    })
    .post('/stripe-webhook', (ctx) => handleWebhook(ctx, dao));

// Create the server app with its router/log/session and error management
const app = new Koa();
app.keys = [process.env.COOKIE_SIGNING_KEY]; // random key used to sign cookies
app.proxy = true;
app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    logger.info(`${ctx.method} ${ctx.url} - ${Date.now() - start}ms`);
})
    .use(
        koaSession(
            {
                store: {
                    get: (key) => dao.getSession(key),
                    set: (key, sess) => dao.setSession(key, sess),
                    destroy: (key) => dao.deleteSession(key),
                },
                maxAge: 3600000, // 1h
            },
            app
        )
    )
    .use(koaBodyParser())
    .use(router.routes())
    .use(router.allowedMethods())
    .on('error', (err, ctx) => {
        logger.error(err.stack);
        Sentry.withScope((scope) => {
            scope.addEventProcessor((event) => {
                return Sentry.Handlers.parseRequest(event, ctx.request);
            });
            Sentry.captureException(err);
        });
    });

logger.info('Connecting to the databases...');
dao.load()
    .then(() => {
        app.listen(4000);
        logger.info(`🚀 Server ready at http://localhost:4000`);
    })
    .catch((err) => {
        Sentry.captureException(err);
        logger.error(err);
    });
