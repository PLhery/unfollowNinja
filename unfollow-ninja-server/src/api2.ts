import 'dotenv/config';

import * as Sentry from '@sentry/node';
import Koa from 'koa';
import Router from 'koa-router';
import session from 'koa-session';
import Dao from './dao/dao';
import kue from 'kue';
import logger, {setLoggerPrefix} from './utils/logger';
import { createAuthRouter } from './api2/auth';

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
const queue = kue.createQueue({redis: process.env.REDIS_KUE_URI});
const authRouter = createAuthRouter(dao, queue);

const router = new Router()
  .get('/', ctx => {
    ctx.body = {status: 'ᕕ( ᐛ )ᕗ Hello, fellow human'};
  })
  .use('/auth', authRouter.routes(), authRouter.allowedMethods())
  .get('/test', ctx => {
    ctx.body = {status: ctx.session};
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
  .use(session({
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
    app.listen(3000)
    logger.info(`🚀 Server ready at http://localhost:3000`);
  })
