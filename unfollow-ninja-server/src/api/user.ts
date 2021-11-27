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
      ctx.status = 204;
    })
    .post('/logout', async ctx => {
      const session = ctx.session as NinjaSession;
      session.userId = null;
      session.username = null;
      ctx.status = 204;
    })
    .put('/lang', async ctx => {
      const session = ctx.session as NinjaSession;
      const lang = (ctx.request as any).body?.lang;
      if (!['en', 'fr', 'pt', 'es'].includes(lang)) {
        await ctx.throw(400);
      }
      await dao.getUserDao(session.userId).setUserParams({lang});
      ctx.status = 204;
    });
}