import 'dotenv/config';

import * as Sentry from '@sentry/node';
import Koa from 'koa';
import Router from 'koa-router';
import koaSession from 'koa-session';
import Bull from 'bull';

import Dao, {UserCategory} from './dao/dao';
import logger, {setLoggerPrefix} from './utils/logger';
import { createAuthRouter } from './api/auth';
import { createAdminRouter } from './api/admin';
import { createUserRouter } from './api/user';

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
const userRouter = createUserRouter(dao);
const adminRouter = createAdminRouter(dao);

export interface NinjaSession {
  twitterTokenSecret?: Record<string, string>;
  userId?: string;
  username?: string;
}

const router = new Router()
  .get('/', ctx => {
    ctx.body = {status: 'ᕕ( ᐛ )ᕗ Hello, fellow human'};
  })
  .get('/robots.txt', ctx => {
    ctx.body = 'User-agent: *\nDisallow: /';
  })
  .use('/auth', authRouter.routes(), authRouter.allowedMethods())
  .use('/user', userRouter.routes(), userRouter.allowedMethods())
  .use('/admin', adminRouter.routes(), adminRouter.allowedMethods())
  .get('/get-status', async ctx => {
    ctx.set('Access-Control-Allow-Origin', process.env.WEB_URL);
    ctx.set('Access-Control-Allow-Credentials', 'true');
    ctx.set('Vary', 'origin');

    const session = ctx.session as NinjaSession;
    if (!session.userId) {
      ctx.body = {
        username: null,
        dmUsername: null,
        category: null,
        lang: null
      };
    } else {
      const [params, category] = await Promise.all([
        dao.getUserDao(session.userId).getUserParams(),
        dao.getUserDao(session.userId).getCategory(),
      ])
      ctx.body = {
        username: session.username,
        dmUsername: params.dmId ? await dao.getCachedUsername(params.dmId) : null,
        category,
        lang: params.lang
      };
    }
  });

// Create the server app with its router/log/session and error management
const app = new Koa();
app.keys = [ process.env.COOKIE_SIGNING_KEY ]; // random key used to sign cookies
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
  .use(router.routes())
  .use(router.allowedMethods())
  .on('error', err => {
    logger.error(err.stack);
    Sentry.captureException(err);
  });

logger.info('Connecting to the databases...')
dao.load()
  .then(() => {
    app.listen(4000)
    logger.info(`🚀 Server ready at http://localhost:4000`);
  })
