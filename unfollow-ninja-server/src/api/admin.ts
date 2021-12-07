import Router from 'koa-router';
import type { Queue } from 'bull';

import type Dao from '../dao/dao';
import type { NinjaSession } from '../api';
import { UserCategory } from '../dao/dao';
import { WebEvent } from '../dao/userEventDao';
import {disablePro, enablePro} from './stripe';

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
      const userId = await getUserId(ctx.params.usernameOrId);
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
      const userId = await getUserId(ctx.params.usernameOrId);
      const username = await dao.getCachedUsername(userId)

      dao.userEventDao.logWebEvent(session.userId, WebEvent.enablePro, ctx.ip, username, userId);
      await enablePro(dao, queue, userId, 'pro', ctx.ip, 'admin-' + session.userId)
      ctx.status = 204;
    })
    .get('/set-friends/:usernameOrId', async ctx => {
        const session = ctx.session as NinjaSession;
        const userId = await getUserId(ctx.params.usernameOrId);
        const username = await dao.getCachedUsername(userId)

        dao.userEventDao.logWebEvent(session.userId, WebEvent.enableFriends, ctx.ip, username, userId);
        await enablePro(dao, queue, userId, 'friends', ctx.ip, 'admin-' + session.userId)
        ctx.status = 204;
    })
    .get('/remove-pro/:usernameOrId', async ctx => {
      const session = ctx.session as NinjaSession;
      const userId = await getUserId(ctx.params.usernameOrId);
      const username = await dao.getCachedUsername(userId)

      dao.userEventDao.logWebEvent(session.userId, WebEvent.disablePro, ctx.ip, username, userId);
      await disablePro(dao, userId, ctx.ip, 'admin-' + session.userId)

      ctx.status = 204;
    });

  async function getUserId(usernameOrId: string) {
    if(!Number.isNaN(Number(usernameOrId)))  { // usernameOrId is an ID
      return usernameOrId;
    } else { // usernameOrId is a username, look for the ID
      const client = await dao.getUserDao(process.env.ADMIN_USERID).getTwitterApi();
      const result = await client.v1.user({screen_name: usernameOrId});
      return result.id_str;
    }
  }
}