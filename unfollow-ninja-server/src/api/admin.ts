import Router from 'koa-router';

import type Dao from '../dao/dao';
import type { NinjaSession } from '../api';
import { UserCategory } from '../dao/dao';
import { WebEvent } from '../dao/userEventDao';

export function createAdminRouter(dao: Dao) {
  return new Router()
    .use(async (ctx, next) => {
      const session = ctx.session as NinjaSession;
      if (!process.env.ADMIN_USERID || session.userId !== process.env.ADMIN_USERID) {
        await ctx.throw(401);
        return;
      }
      await next();
    })
    .get('/user/:usernameOrId', async (ctx) => {
      let userId: string;
      if(!Number.isNaN(Number(ctx.params.usernameOrId)))  { // usernameOrId is an ID
        userId = ctx.params.usernameOrId;
      } else { // usernameOrId is a username, look for the ID
        const client = await dao.getUserDao(process.env.ADMIN_USERID).getTwitterApi();
        try {
          const result = await client.v1.user({screen_name: ctx.params.usernameOrId});
          userId = result.id_str;
        } catch {
          userId = await dao.getCachedUserId(ctx.params.usernameOrId); // can take some time as the username is not indexed
        }
      }

      const userDao = dao.getUserDao(userId);
      const params = await userDao.getUserParams();
      const username = await userDao.getUsername();

      dao.userEventDao.logWebEvent(ctx.session.userId, WebEvent.adminFetchUser, ctx.ip, username, userId);

      ctx.body = JSON.stringify({
        id: userId,
        username,
        category: await userDao.getCategory(),
        categoryStr: UserCategory[await userDao.getCategory()],
        addedAt: params.added_at,
        lang: params.lang,
        dmId: params.dmId,
        dmUsername: await dao.getCachedUsername(params.dmId),
        notificationEvents: await dao.userEventDao.getNotificationEvents(userId),
        categoryEvents: await dao.userEventDao.getCategoryEvents(userId),
        webEvents: await dao.userEventDao.getWebEvents(userId),
        followEvents: await dao.userEventDao.getFollowEvent(userId),
        unfollowerEvents: await dao.userEventDao.getUnfollowerEvents(userId),
        followers: await userDao.getFollowers(),
        uncachables: await userDao.getUncachableFollowers(),
      }, null, 2);
      ctx.response.type = 'json';
    })
}