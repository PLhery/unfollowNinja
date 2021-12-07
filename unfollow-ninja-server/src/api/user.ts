import Router from 'koa-router';
import type { Queue } from 'bull';

import type Dao from '../dao/dao';
import type { NinjaSession } from '../api';
import { UserCategory } from '../dao/dao';
import { WebEvent } from '../dao/userEventDao';
import { SUPPORTED_LANGUAGES_CONST } from '../utils/utils';
import Stripe from 'stripe';

export function createUserRouter(dao: Dao, queue: Queue) {
  const stripe = process.env.STRIPE_SK ? new Stripe(process.env.STRIPE_SK, {
    apiVersion: '2020-08-27',
  }) : null;

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
        return;
      }
      await dao.getUserDao(session.userId).setUserParams({lang});
      dao.userEventDao.logWebEvent(session.userId, WebEvent.setLang, ctx.ip, session.username, lang);

      await queue.add('sendWelcomeMessage', {
        id: Date.now(), // otherwise some seem stuck??
        userId: session.userId,
        username: session.username,
      });

      ctx.status = 204;
    })
    .put('/registerFriendCode', async ctx => { // /!\ to rate limit
      const session = ctx.session as NinjaSession;
      const code = (ctx.request as any).body?.code;

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
      await dao.getUserDao(session.userId).setUserParams({pro: '3'});
      await dao.getUserDao(session.userId).setCategory(UserCategory.vip);

      await queue.add('sendWelcomeMessage', {
        id: Date.now(), // otherwise some seem stuck??
        userId: session.userId,
        username: session.username,
        isPro: true,
      });

      ctx.status = 204;
    })
    .get('/buy-pro', async ctx => {
      const session = ctx.session as NinjaSession;
      if(!stripe) {
        ctx.throw(404)
        return;
      }

      const stripeSession = await stripe.checkout.sessions.create({
        billing_address_collection: 'auto',
        line_items: [
          {
            price:  'price_1K2j6qEwrjMfujSGZiTUPDH9', // pro 3$/y
            quantity: 1,
          },
        ],
        mode: 'subscription',
        subscription_data: {
          metadata: {
            userId: session.userId,
            username: session.username,
            plan: 'pro'
          }
        },
        allow_promotion_codes: false,
        success_url: `${process.env.WEB_URL}`,
        cancel_url: `${process.env.WEB_URL}`,
      });

      ctx.redirect(stripeSession.url);
    })
    .get('/buy-friends', async ctx => {
      const session = ctx.session as NinjaSession;
      if(!stripe) {
        ctx.throw(404)
        return;
      }

      const stripeSession = await stripe.checkout.sessions.create({
        billing_address_collection: 'auto',
        line_items: [
          {
            price:  'price_1K3pLUEwrjMfujSGjQxbfSOB', // friends 5$/y
            quantity: 1,
          },
        ],
        mode: 'subscription',
        subscription_data: {
          metadata: {
            userId: session.userId,
            username: session.username,
            plan: 'friends'
          },
        },
        allow_promotion_codes: false,
        success_url: `${process.env.WEB_URL}`,
        cancel_url: `${process.env.WEB_URL}`,
      });

      ctx.redirect(stripeSession.url);
    });
}