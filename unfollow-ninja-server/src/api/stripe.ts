import type { Queue } from 'bull';
import type { ParameterizedContext } from 'koa';
import Stripe from 'stripe';

import {WebEvent} from '../dao/userEventDao';
import {UserCategory} from '../dao/dao';
import type Dao from '../dao/dao';

const stripe = process.env.STRIPE_SK ? new Stripe(process.env.STRIPE_SK, {
  apiVersion: '2020-08-27',
}) : null;

export const handleWebhook = async (ctx: ParameterizedContext, dao: Dao, bullQueue: Queue) => {
  const endpointSecret = process.env.STRIPE_WH_SECRET;
  if (!stripe || !endpointSecret) {
    return ctx.throw(404);
  }
  const signature = ctx.request.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      (ctx.request as any).rawBody,
      signature,
      endpointSecret
    );
  } catch (err) {
    return ctx.throw(400);
  }
  const subscription = event.data.object as Stripe.Subscription;
  const {userId} = subscription.metadata;

  switch (event.type) {
    case 'customer.subscription.updated':
      if (subscription.status === 'active') { // enable pro
        const plan = 'prod_KjHvT2vhr2F7tA' === subscription.items.data[0].plan.product ? 'friends' : 'pro';
        await enablePro(dao, bullQueue, userId, plan, ctx.ip, subscription.id);
        const customerId = subscription.customer as string;
        await dao.getUserDao(userId).setUserParams({customerId});
        await stripe.customers.update(customerId, {metadata: subscription.metadata});
      }
      break;
    case 'customer.subscription.deleted':
      await disablePro(dao, userId, ctx.ip, subscription.id);
      break;
  }
  ctx.status = 204;
}

export const enablePro = async (dao: Dao, queue: Queue, userId: string, plan: 'friends' | 'pro', ip: string, subscriptionId: string) => {
  const userDao = dao.getUserDao(userId);
  const username = await dao.getCachedUsername(userId);

  const wasPro = userDao.isPro();
  if (plan === 'friends') {
    dao.userEventDao.logWebEvent(userId, WebEvent.enableFriends, ip, username, subscriptionId);
    await userDao.setUserParams({pro: '2'});
    await userDao.addFriendCodes();
  } else {
    dao.userEventDao.logWebEvent(userId, WebEvent.enablePro, ip, username, subscriptionId);
    await userDao.setUserParams({pro: '1'});
    await disableFriendCodes(dao, userId, ip); // in case the update is a downgrade
  }
  if (UserCategory.enabled === await userDao.getCategory()) {
    await userDao.setCategory(UserCategory.vip);
  }

  if (!wasPro) {
    await queue.add('sendWelcomeMessage', {
      id: Date.now(),
      userId,
      username,
      isPro: true,
    });
  }
}

export const disablePro = async (dao: Dao, userId: string, ip: string, subscriptionId: string) => {
  const userDao = dao.getUserDao(userId);
  const username = await dao.getCachedUsername(userId);

  dao.userEventDao.logWebEvent(userId, WebEvent.disablePro, ip, username, subscriptionId);
  await userDao.setUserParams({pro: '0'});
  await disableFriendCodes(dao, userId, ip);
  if (UserCategory.vip === await userDao.getCategory()) {
    await userDao.setCategory(UserCategory.enabled);
  }
}

const disableFriendCodes = async (dao: Dao, userId: string, ip: string) => {
  const userDao = dao.getUserDao(userId);
  for (const code of await userDao.getFriendCodes()) {
    if (code.friendId) { // disable pro for friends too
      const friendUsername = await dao.getCachedUsername(code.friendId);
      dao.userEventDao.logWebEvent(userId, WebEvent.disableFriendRegistration, ip, friendUsername, code.friendId);
      dao.userEventDao.logWebEvent(code.friendId, WebEvent.disableFriendRegistration, ip, friendUsername, code.userId);
      await dao.getUserDao(code.friendId).setUserParams({pro: '0'});
      if (UserCategory.vip === await dao.getUserDao(code.friendId).getCategory()) {
        await dao.getUserDao(code.friendId).setCategory(UserCategory.enabled);
      }
    }
    await userDao.deleteFriendCodes(code.code);
  }
}

export const generateProCheckoutUrl = async (plan: 'pro' | 'friends', userId: string, username: string) => {
  if(!stripe) {
    return null;
  }
  const stripeSession = await stripe.checkout.sessions.create({
    billing_address_collection: 'auto',
    line_items: [
      {
        price: plan === 'friends' ? 'price_1K3pLUEwrjMfujSGjQxbfSOB' : 'price_1K2j6qEwrjMfujSGZiTUPDH9',
        quantity: 1,
      },
    ],
    mode: 'subscription',
    subscription_data: {
      metadata: {
        userId,
        username,
      },
    },
    metadata: {
      userId,
      username,
    },
    allow_promotion_codes: false,
    success_url: `${process.env.WEB_URL}`,
    cancel_url: `${process.env.WEB_URL}`,
  });
  return stripeSession.url;
}

export const getManageSubscriptionUrl = async(dao: Dao, userId: string) => {
  if (!stripe) {
    return null;
  }
  const customer = (await dao.getUserDao(userId).getUserParams()).customerId;
  if (!customer) {
    return null;
  }
  return (await stripe.billingPortal.sessions.create({customer})).url;
}