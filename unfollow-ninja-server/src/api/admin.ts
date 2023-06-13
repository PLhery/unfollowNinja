import Router from 'koa-router';

import type Dao from '../dao/dao';
import { UserCategory } from '../dao/dao';
import type { NinjaSession } from '../api';
import { WebEvent } from '../dao/userEventDao';
import { disablePro, enablePro } from './stripe';
import logger from '../utils/logger';

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
            const userId = await getUserId(ctx.params.usernameOrId);
            const userDao = dao.getUserDao(userId);

            const [
                params,
                username,
                category,
                friendCodes,
                registeredFriendCode,
                notificationEvents,
                categoryEvents,
                webEvents,
            ] = await Promise.all([
                userDao.getUserParams(),
                userDao.getUsername(),
                userDao.getCategory(),
                userDao.getFriendCodes(),
                userDao.getRegisteredFriendCode(),
                dao.userEventDao.getNotificationEvents(userId),
                dao.userEventDao.getCategoryEvents(userId),
                dao.userEventDao.getWebEvents(userId),
            ]);

            await dao.userEventDao.logWebEvent(ctx.session.userId, WebEvent.adminFetchUser, ctx.ip, username, userId);

            ctx.body = JSON.stringify(
                {
                    id: userId,
                    username,
                    category,
                    categoryStr: UserCategory[category],
                    addedAt: params.added_at,
                    lang: params.lang,
                    dmId: params.dmId,
                    dmUsername: await dao.getCachedUsername(params.dmId),
                    pro: params.pro,
                    customerId: params.customerId,
                    friendCodes,
                    registeredFriendCode,
                    notificationEvents,
                    categoryEvents,
                    webEvents,
                },
                null,
                2
            );
            ctx.response.type = 'json';
        })
        .get('/user-full/:usernameOrId', async (ctx) => {
            const userId = await getUserId(ctx.params.usernameOrId);
            const userDao = dao.getUserDao(userId);

            const [
                params,
                username,
                category,
                friendCodes,
                registeredFriendCode,
                notificationEvents,
                categoryEvents,
                webEvents,
                unfollowerEvents,
                followEvents,
                followers,
                uncachables,
            ] = await Promise.all([
                userDao.getUserParams(),
                userDao.getUsername(),
                userDao.getCategory(),
                userDao.getFriendCodes(),
                userDao.getRegisteredFriendCode(),
                dao.userEventDao.getNotificationEvents(userId),
                dao.userEventDao.getCategoryEvents(userId),
                dao.userEventDao.getWebEvents(userId),
                dao.userEventDao.getUnfollowerEvents(userId),
                dao.userEventDao.getFollowEvent(userId),
                userDao.getFollowers(),
                userDao.getUncachableFollowers(),
            ]);

            await dao.userEventDao.logWebEvent(ctx.session.userId, WebEvent.adminFetchUser, ctx.ip, username, userId);

            ctx.body = JSON.stringify(
                {
                    id: userId,
                    username,
                    category,
                    categoryStr: UserCategory[category],
                    addedAt: params.added_at,
                    lang: params.lang,
                    dmId: params.dmId,
                    dmUsername: await dao.getCachedUsername(params.dmId),
                    pro: params.pro,
                    customerId: params.customerId,
                    friendCodes,
                    registeredFriendCode,
                    notificationEvents,
                    categoryEvents,
                    webEvents,
                    unfollowerEvents,
                    followEvents,
                    followers,
                    uncachables,
                },
                null,
                2
            );
            ctx.response.type = 'json';
        })
        .get('/set-pro/:usernameOrId', async (ctx) => {
            const session = ctx.session as NinjaSession;
            const userId = await getUserId(ctx.params.usernameOrId);
            const username = await dao.getCachedUsername(userId);

            await dao.userEventDao.logWebEvent(session.userId, WebEvent.enablePro, ctx.ip, username, userId);
            await enablePro(dao, userId, 'pro', ctx.ip, 'admin-' + session.userId);
            ctx.status = 204;
        })
        .get('/set-friends/:usernameOrId', async (ctx) => {
            const session = ctx.session as NinjaSession;
            const userId = await getUserId(ctx.params.usernameOrId);
            const username = await dao.getCachedUsername(userId);

            await dao.userEventDao.logWebEvent(session.userId, WebEvent.enableFriends, ctx.ip, username, userId);
            await enablePro(dao, userId, 'friends', ctx.ip, 'admin-' + session.userId);
            ctx.status = 204;
        })
        .get('/remove-pro/:usernameOrId', async (ctx) => {
            const session = ctx.session as NinjaSession;
            const userId = await getUserId(ctx.params.usernameOrId);
            const username = await dao.getCachedUsername(userId);

            await dao.userEventDao.logWebEvent(session.userId, WebEvent.disablePro, ctx.ip, username, userId);
            await disablePro(dao, userId, ctx.ip, 'admin-' + session.userId);
            ctx.status = 204;
        })
        .get('/enable/:usernameOrId', async (ctx) => {
            const userId = await getUserId(ctx.params.usernameOrId);
            await dao.getUserDao(userId).enable();
            ctx.status = 204;
        })
        .get('/disable/:usernameOrId', async (ctx) => {
            const userId = await getUserId(ctx.params.usernameOrId);
            await dao.getUserDao(userId).setCategory(UserCategory.disabled);
            ctx.status = 204;
        })
        .get('/update-params/:usernameOrId', async (ctx) => {
            const userId = await getUserId(ctx.params.usernameOrId);
            await dao.getUserDao(userId).setUserParams(ctx.request.query);
            ctx.status = 204;
        });

    async function getUserId(usernameOrId: string) {
        if (!Number.isNaN(Number(usernameOrId))) {
            // usernameOrId is an ID
            return usernameOrId;
        } else {
            // usernameOrId is a username, look for the ID
            try {
                const client = await dao.getUserDao(process.env.ADMIN_USERID).getTwitterApi();
                const result = await client.v1.user({ screen_name: usernameOrId });
                return result.id_str;
            } catch (e) {
                logger.error(
                    'Tried to fetch userId for ' + usernameOrId + ' but failed, falling back to the cache.\n' + e.error
                );
                return await dao.getCachedUserId(usernameOrId);
            }
        }
    }
}
