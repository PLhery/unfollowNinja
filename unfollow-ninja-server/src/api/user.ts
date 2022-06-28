import Router from 'koa-router';
import type { Queue } from 'bull';
import geoip from 'geoip-country';

import type Dao from '../dao/dao';
import type { NinjaSession } from '../api';
import { UserCategory } from '../dao/dao';
import { WebEvent } from '../dao/userEventDao';
import { SUPPORTED_LANGUAGES_CONST } from '../utils/utils';
import { generateProCheckoutUrl, getManageSubscriptionUrl } from './stripe';

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
        .post('/disable', async (ctx) => {
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
        .post('/logout', async (ctx) => {
            const session = ctx.session as NinjaSession;
            dao.userEventDao.logWebEvent(session.userId, WebEvent.logout, ctx.ip, session.username);
            session.userId = null;
            session.username = null;
            ctx.status = 204;
        })
        .put('/lang', async (ctx) => {
            const session = ctx.session as NinjaSession;
            const lang = ctx.request['body']?.['lang'];
            if (!SUPPORTED_LANGUAGES_CONST.includes(lang)) {
                await ctx.throw(400);
                return;
            }
            await dao.getUserDao(session.userId).setUserParams({ lang });
            dao.userEventDao.logWebEvent(session.userId, WebEvent.setLang, ctx.ip, session.username, lang);

            await queue.add('sendWelcomeMessage', {
                id: Date.now(), // otherwise some seem stuck??
                userId: session.userId,
                username: session.username,
            });

            ctx.status = 204;
        })
        .put('/registerFriendCode', async (ctx) => {
            // /!\ to rate limit
            const session = ctx.session as NinjaSession;
            const code = ctx.request['body']?.['code'];

            dao.userEventDao.logWebEvent(session.userId, WebEvent.tryFriendCode, ctx.ip, session.username, code);
            if (code.length !== 6) {
                ctx.throw(400);
                return;
            }
            const success = await dao.getUserDao(session.userId).registerFriendCode(code);
            if (!success) {
                ctx.throw(404);
                return;
            }

            dao.userEventDao.logWebEvent(session.userId, WebEvent.registeredAsFriend, ctx.ip, session.username, code);
            await dao.getUserDao(session.userId).setUserParams({ pro: '3' });
            await dao.getUserDao(session.userId).setCategory(UserCategory.vip);

            await queue.add('sendWelcomeMessage', {
                id: Date.now(), // otherwise some seem stuck??
                userId: session.userId,
                username: session.username,
                isPro: true,
            });

            ctx.status = 204;
        })
        .get('/buy-pro', async (ctx) => {
            const session = ctx.session as NinjaSession;
            const country = geoip.lookup(ctx.ip)?.country;
            const checkoutUrl = await generateProCheckoutUrl(country, 'pro', session.userId, session.username);
            if (!checkoutUrl) {
                // stripe disabled
                ctx.throw(404);
                return;
            }

            ctx.redirect(checkoutUrl);
        })
        .get('/buy-friends', async (ctx) => {
            const session = ctx.session as NinjaSession;
            const country = geoip.lookup(ctx.ip)?.country;
            const checkoutUrl = await generateProCheckoutUrl(country, 'friends', session.userId, session.username);
            if (!checkoutUrl) {
                // stripe disabled
                ctx.throw(404);
                return;
            }

            ctx.redirect(checkoutUrl);
        })
        .get('/manage-subscription', async (ctx) => {
            const session = ctx.session as NinjaSession;
            const manageSubscriptionUrl = await getManageSubscriptionUrl(dao, session.userId);
            if (!manageSubscriptionUrl) {
                // stripe disabled or no customerId
                ctx.body = 'No subscription could be found on this account.';
                ctx.status = 404;
                return;
            }

            ctx.redirect(manageSubscriptionUrl);
        })
        .get('/latest-notifications', async (ctx) => {
            const session = ctx.session as NinjaSession;
            const events = await dao.userEventDao.getNotificationEvents(session.userId, 30, 0);

            ctx.body = events.map((event) => ({
                sentAt: event.createdAt,
                message: event.message,
            }));
        });
}
