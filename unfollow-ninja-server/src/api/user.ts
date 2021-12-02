import Router from 'koa-router';
import type { Queue } from 'bull';

import type Dao from '../dao/dao';
import type { NinjaSession } from '../api';
import { UserCategory } from '../dao/dao';
import { WebEvent } from '../dao/userEventDao';
import { SUPPORTED_LANGUAGES_CONST } from '../utils/utils';

export function createUserRouter(dao: Dao, queue: Queue) {
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
      dao.userEventDao.logWebEvent(session.userId, WebEvent.disable, ctx.ip, session.username);
      ctx.status = 204;
    })
    .post('/logout', async ctx => {
      const session = ctx.session as NinjaSession;
      dao.userEventDao.logWebEvent(session.userId, WebEvent.logout, ctx.ip, session.username);
      session.userId = null;
      session.username = null;
      ctx.status = 204;
    })
    .put('/lang', async ctx => {
      const session = ctx.session as NinjaSession;
      const lang = (ctx.request as any).body?.lang;
      if (!SUPPORTED_LANGUAGES_CONST.includes(lang)) {
        await ctx.throw(400);
      }
      await dao.getUserDao(session.userId).setUserParams({lang});
      dao.userEventDao.logWebEvent(session.userId, WebEvent.setLang, ctx.ip, session.username, lang);

      await queue.add('sendWelcomeMessage', {
        id: Date.now(), // otherwise some seem stuck??
        userId: session.userId,
        username: session.username,
      });

      ctx.status = 204;
    });
}