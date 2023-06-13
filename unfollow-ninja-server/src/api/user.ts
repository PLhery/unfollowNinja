import Router from 'koa-router';
import geoip from 'geoip-country';

import type Dao from '../dao/dao';
import type { NinjaSession } from '../api';
import { UserCategory } from '../dao/dao';
import { IUnfollowerEvent, WebEvent } from '../dao/userEventDao';
import { SUPPORTED_LANGUAGES_CONST } from '../utils/utils';
import { generateProCheckoutUrl, getManageSubscriptionUrl } from './stripe';
import moment from 'moment-timezone';

export function createUserRouter(dao: Dao) {
    return (
        new Router()
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
                void dao.userEventDao.logWebEvent(session.userId, WebEvent.disable, ctx.ip, session.username);
                ctx.status = 204;
            })
            .post('/logout', async (ctx) => {
                const session = ctx.session as NinjaSession;
                void dao.userEventDao.logWebEvent(session.userId, WebEvent.logout, ctx.ip, session.username);
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
                void dao.userEventDao.logWebEvent(session.userId, WebEvent.setLang, ctx.ip, session.username, lang);

                ctx.status = 204;
            })
            .put('/registerFriendCode', async (ctx) => {
                // /!\ to rate limit
                const session = ctx.session as NinjaSession;
                const code = ctx.request['body']?.['code'];

                void dao.userEventDao.logWebEvent(
                    session.userId,
                    WebEvent.tryFriendCode,
                    ctx.ip,
                    session.username,
                    code
                );
                if (code.length !== 6) {
                    ctx.throw(400);
                    return;
                }
                const success = await dao.getUserDao(session.userId).registerFriendCode(code);
                if (!success) {
                    ctx.throw(404);
                    return;
                }

                void dao.userEventDao.logWebEvent(
                    session.userId,
                    WebEvent.registeredAsFriend,
                    ctx.ip,
                    session.username,
                    code
                );
                await dao.getUserDao(session.userId).setUserParams({ pro: '3' });
                await dao.getUserDao(session.userId).setCategory(UserCategory.vip);

                ctx.status = 204;
            })
            .get('/buy-pro', async (ctx) => {
                const session = ctx.session as NinjaSession;
                const country = geoip.lookup(ctx.ip)?.country;
                const checkoutUrl = await generateProCheckoutUrl(dao, country, 'pro', session.userId, session.username);
                if (!checkoutUrl) {
                    // stripe disabled
                    ctx.throw(404);
                    return;
                }

                ctx.redirect(checkoutUrl);
            })
            /*.get('/buy-friends', async (ctx) => {
                const session = ctx.session as NinjaSession;
                const country = geoip.lookup(ctx.ip)?.country;
                const checkoutUrl = await generateProCheckoutUrl(country, 'friends', session.userId, session.username);
                if (!checkoutUrl) {
                    // stripe disabled
                    ctx.throw(404);
                    return;
                }

                ctx.redirect(checkoutUrl);
            })*/
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
            })
            .get('/latest-unfollowers', async (ctx) => {
                const session = ctx.session as NinjaSession;
                const events = await dao.userEventDao.getFilteredUnfollowerEvents(session.userId, 250, 0);

                const alreadySeen = new Set<string>();
                const unfollowers = (
                    await Promise.all(
                        events
                            .filter((event) => {
                                const alreadyInThere = alreadySeen.has(event.followerId);
                                alreadySeen.add(event.followerId);
                                return !alreadyInThere;
                            })
                            .map(async (event) => ({
                                followerId: event.followerId,
                                username: await dao.getCachedUsername(event.followerId),
                                followTime: event.followTime * 1000,
                                unfollowTime: new Date(event.createdAt).getTime(),
                                reason: getReason(event),
                                following: event.following,
                                duration: moment(event.followTime * 1000).to(event.createdAt, true),
                                profileImageUrl: null as null | string,
                            }))
                    )
                ).slice(0, 100);

                const twitterApi = await dao.getUserDao(session.userId).getTwitterApi();
                const results = await twitterApi.v2.users(
                    unfollowers.map((follower) => follower.followerId),
                    { 'user.fields': 'profile_image_url' }
                );
                results.data.forEach((user) => {
                    const unfollower = unfollowers.find((u) => u.followerId === user.id);
                    if (unfollower) {
                        unfollower.profileImageUrl = user.profile_image_url.replace('_normal', '_bigger');
                    }
                });
                ctx.body = unfollowers;
            })
    );
}

function getReason(event: IUnfollowerEvent) {
    if (event.suspended) {
        return (event.following ? '💔' : '') + '🙈 suspended';
    } else if (event.deleted) {
        return (event.following ? '💔' : '') + '🙈 has left Twitter';
    } else if (event.blockedBy) {
        return (event.following ? '💔' : '') + '⛔ blocked you';
    } else if (event.blocking) {
        return (event.following ? '💔' : '') + '💩💩💩 You blocked them';
    } else if (event.locked) {
        return (event.following ? '💔' : '') + '🔒 account locked';
    } else if (event.following) {
        return '💔 unfollowed you';
    }
    return '👋 unfollowed you';
}
