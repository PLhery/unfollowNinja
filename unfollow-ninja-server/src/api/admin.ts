import Router from 'koa-router';

import type Dao from '../dao/dao';
import type { NinjaSession } from '../api';
import { UserCategory } from '../dao/dao';

export function createAdminRouter(dao: Dao) {
  return new Router()
    .use(async (ctx, next) => {
      const session = ctx.session as NinjaSession;
      if (process.env.ADMIN_USERID && session.userId !== process.env.ADMIN_USERID) {
        await ctx.throw(401);
        return;
      }
      await next();
    })
    .get('/user/:usernameOrId', async (ctx) => {
      const userId = Number.isNaN(Number(ctx.params.usernameOrId)) ?
        await dao.getCachedUserId(ctx.params.usernameOrId) :
        ctx.params.usernameOrId;

      const userDao = dao.getUserDao(userId);
      const params = await userDao.getUserParams();

      ctx.body = JSON.stringify({
        id: userId,
        username: await userDao.getUsername(),
        category: await userDao.getCategory(),
        categoryStr: UserCategory[await userDao.getCategory()],
        addedAt: params.added_at,
        lang: params.lang,
        dmId: params.dmId,
        dmUsername: await dao.getCachedUsername(params.dmId),
        followers: await userDao.getFollowers(),
        uncachables: await userDao.getUncachableFollowers(),
      }, null, 2);
      ctx.response.type = 'json';
    })
}