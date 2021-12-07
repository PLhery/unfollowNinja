import 'dotenv/config';

import * as Sentry from '@sentry/node';
import Koa from 'koa';
import Router from 'koa-router';
import koaSession from 'koa-session';
import koaBodyParser from 'koa-bodyparser';
import koaCors from '@koa/cors';
import Bull from 'bull';
import geoip from 'geoip-country';
import Stripe from 'stripe';

import Dao, {UserCategory} from './dao/dao';
import logger, {setLoggerPrefix} from './utils/logger';
import {createAuthRouter} from './api/auth';
import {createAdminRouter} from './api/admin';
import {createUserRouter} from './api/user';
import {disablePro, enablePro} from './api/stripe';

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
  Sentry.init({ dsn: SENTRY_DSN });
}

assertEnvVariable('REDIS_URI');
assertEnvVariable('POSTGRES_URI');
const dao = new Dao();
const bullQueue = new Bull('ninja', process.env.REDIS_BULL_URI, {
  defaultJobOptions: {
    attempts: 3,
    backoff: 60000,
    removeOnComplete: true,
    removeOnFail: true
  }
});
bullQueue.on('error', (err) => {
  logger.error('Bull error: ' + err.stack);
  Sentry.captureException(err);
})

const authRouter = createAuthRouter(dao, bullQueue);
const userRouter = createUserRouter(dao, bullQueue);
const adminRouter = createAdminRouter(dao, bullQueue);

export interface NinjaSession {
  twitterTokenSecret?: Record<string, string>;
  userId?: string;
  username?: string;
}

const stripe = process.env.STRIPE_SK ? new Stripe(process.env.STRIPE_SK, {
  apiVersion: '2020-08-27',
}) : null;

const router = new Router()
  .get('/', ctx => {
    ctx.body = {status: 'ᕕ( ᐛ )ᕗ Hello, fellow human'};
  })
  .get('/robots.txt', ctx => {
    ctx.body = 'User-agent: *\nDisallow: /';
  })
  .use('/auth', authRouter.routes(), authRouter.allowedMethods())
  .use('/admin', adminRouter.routes(), adminRouter.allowedMethods())
  .all('/(.*)', koaCors({ // only routes below are allowed for CORS
    origin: process.env.WEB_URL,
    credentials: true,
  }))
  .use('/user', userRouter.routes(), userRouter.allowedMethods())
  .get('/get-status', async ctx => {
    const session = ctx.session as NinjaSession;
    if (!session.userId) {
      ctx.body = {
        country: geoip.lookup(ctx.ip)?.country,
      };
    } else {
      const [params, category] = await Promise.all([
        dao.getUserDao(session.userId).getUserParams(),
        dao.getUserDao(session.userId).getCategory(),
      ])
      ctx.body = {
        username: session.username,
        dmUsername: params.dmId && [UserCategory.enabled, UserCategory.vip].includes(category) ?
          await dao.getCachedUsername(params.dmId) : null,
        category,
        lang: params.lang,
        country: geoip.lookup(ctx.ip)?.country,
        isPro: Number(params.pro) > 0,
        friendCodes: params.pro === '2' ? await dao.getUserDao(session.userId).getFriendCodesWithUsername() : null,
      };
    }
  })
  .post('/stripe-webhook', async ctx => {
    const endpointSecret = process.env.STRIPE_WH_SECRET;
    if (!stripe || !endpointSecret) {
      return ctx.throw(404);
    }
    const signature = ctx.request.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        (ctx.request as any).rawBody,
        signature,
        endpointSecret
      );
    } catch (err) {
      return ctx.throw(400);
    }
    const subscription = event.data.object;
    const { userId, plan } = subscription.metadata;

    switch (event.type) {
      case 'customer.subscription.updated':
        if (subscription.status === 'active') { // enable pro
          await enablePro(dao, bullQueue, userId, plan, ctx.ip, subscription.id);
        }
        break;
      case 'customer.subscription.deleted':
        await disablePro(dao, userId, ctx.ip, subscription.id);
        break;
    }
    ctx.status=204;
  });

// Create the server app with its router/log/session and error management
const app = new Koa();
app.keys = [ process.env.COOKIE_SIGNING_KEY ]; // random key used to sign cookies
app.proxy = true;
app
  .use(async (ctx, next) => {
    const start = Date.now();
    await next();
    logger.info(`${ctx.method} ${ctx.url} - ${Date.now() - start}ms`);
  })
  .use(koaSession({
    store: {
      get: key => dao.getSession(key),
      set: (key, sess) => dao.setSession(key, sess),
      destroy: key => dao.deleteSession(key)
    },
    maxAge: 3600000 // 1h
  }, app))
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

logger.info('Connecting to the databases...')
dao.load()
  .then(() => {
    app.listen(4000)
    logger.info(`🚀 Server ready at http://localhost:4000`);
  })
