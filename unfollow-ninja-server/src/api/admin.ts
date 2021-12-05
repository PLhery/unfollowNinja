import Router from 'koa-router';
import type { Queue } from 'bull';

import type Dao from '../dao/dao';
import type { NinjaSession } from '../api';
import { UserCategory } from '../dao/dao';
import { WebEvent } from '../dao/userEventDao';

export function createAdminRouter(dao: Dao, queue: Queue) {
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
        pro: params.pro,
        friendCodes: await userDao.getFriendCodes(),
        registeredFriendCode: await userDao.getRegisteredFriendCode(),
        notificationEvents: await dao.userEventDao.getNotificationEvents(userId),
        categoryEvents: await dao.userEventDao.getCategoryEvents(userId),
        webEvents: await dao.userEventDao.getWebEvents(userId),
        unfollowerEvents: await dao.userEventDao.getUnfollowerEvents(userId),
        followEvents: await dao.userEventDao.getFollowEvent(userId),
        followers: await userDao.getFollowers(),
        uncachables: await userDao.getUncachableFollowers(),
      }, null, 2);
      ctx.response.type = 'json';
    })
    .get('/set-pro/:usernameOrId', async ctx => {
      const session = ctx.session as NinjaSession;

      let userId: string;
      if(!Number.isNaN(Number(ctx.params.usernameOrId)))  { // usernameOrId is an ID
        userId = ctx.params.usernameOrId;
      } else { // usernameOrId is a username, look for the ID
        const client = await dao.getUserDao(process.env.ADMIN_USERID).getTwitterApi();
        const result = await client.v1.user({screen_name: ctx.params.usernameOrId});
        userId = result.id_str;
      }

      dao.userEventDao.logWebEvent(session.userId, WebEvent.enablePro, ctx.ip, userId);
      await dao.getUserDao(userId).setUserParams({pro: '1'});
      await dao.getUserDao(userId).setCategory(UserCategory.vip);

      await queue.add('sendWelcomeMessage', {
        id: Date.now(), // otherwise some seem stuck??
        userId,
        username: await dao.getCachedUsername(userId),
        isPro: true,
      });

      ctx.status = 204;
    })
    .get('/set-friends/:usernameOrId', async ctx => {
        const session = ctx.session as NinjaSession;

        let userId: string;
        if(!Number.isNaN(Number(ctx.params.usernameOrId)))  { // usernameOrId is an ID
          userId = ctx.params.usernameOrId;
        } else { // usernameOrId is a username, look for the ID
          const client = await dao.getUserDao(process.env.ADMIN_USERID).getTwitterApi();
          const result = await client.v1.user({screen_name: ctx.params.usernameOrId});
          userId = result.id_str;
        }

        dao.userEventDao.logWebEvent(session.userId, WebEvent.enableFriends, ctx.ip, userId);
        await dao.getUserDao(userId).setUserParams({pro: '2'});
        await dao.getUserDao(userId).setCategory(UserCategory.vip);
        await dao.getUserDao(userId).addFriendCodes();

        await queue.add('sendWelcomeMessage', {
          id: Date.now(), // otherwise some seem stuck??
          userId,
          username: await dao.getCachedUsername(userId),
          isPro: true,
        });

        ctx.status = 204;
      });
}