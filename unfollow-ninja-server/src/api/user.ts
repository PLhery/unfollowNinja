import Router from 'koa-router';

import type Dao from '../dao/dao';
import type { NinjaSession } from '../api';
import { UserCategory } from '../dao/dao';

export function createUserRouter(dao: Dao) {
  return new Router()
    .use(async (ctx, next) => {
      const session = ctx.session as NinjaSession;
      if (!session.userId) {
        await ctx.throw(401);
        return;
      }
      ctx.set('Access-Control-Allow-Origin', process.env.WEB_URL);
      ctx.set('Access-Control-Allow-Credentials', 'true');
      ctx.set('Vary', 'origin');
      await next();
    })
    .post('/disable', async ctx => {
      const session = ctx.session as NinjaSession;
      await dao.getUserDao(session.userId).setCategory(UserCategory.disabled);
      await dao.getUserDao(session.userId).setUserParams({
        dmId: null,
        dmToken: null,
        dmTokenSecret: null,
      });
      ctx.status = 200;
    })
    .post('/logout', async ctx => {
      const session = ctx.session as NinjaSession;
      session.userId = null;
      session.username = null;
      ctx.status = 200;
    })
    .put('/lang', async ctx => {
      const session = ctx.session as NinjaSession;
      if (!['en', 'fr', 'pt', 'es'].includes(ctx.body?.lang)) {
        await ctx.throw(400);
      }
      await dao.getUserDao(session.userId).setUserParams({lang: ctx.body.lang});
      ctx.status = 200;
    });
}