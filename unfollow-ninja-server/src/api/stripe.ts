import type { Queue } from 'bull';
import type { ParameterizedContext } from 'koa';
import Stripe from 'stripe';
import { getAllInfoByISO } from 'iso-country-currency';

import { WebEvent } from '../dao/userEventDao';
import { UserCategory } from '../dao/dao';
import type Dao from '../dao/dao';

const stripe = process.env.STRIPE_SK
    ? new Stripe(process.env.STRIPE_SK, {
          apiVersion: '2022-08-01',
      })
    : null;

export const handleWebhook = async (ctx: ParameterizedContext, dao: Dao, bullQueue: Queue) => {
    const endpointSecret = process.env.STRIPE_WH_SECRET;
    if (!stripe || !endpointSecret) {
        return ctx.throw(404);
    }
    const signature = ctx.request.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(ctx.request['rawBody'], signature, endpointSecret);
    } catch (err) {
        return ctx.throw(400);
    }
    const subscription = event.data.object as Stripe.Subscription;
    const { userId } = subscription.metadata;

    switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
            if (subscription.status === 'active' || subscription.status === 'trialing') {
                // enable pro
                const plan = 'prod_KjHvT2vhr2F7tA' === subscription.items.data[0].plan.product ? 'friends' : 'pro';
                await enablePro(dao, bullQueue, userId, plan, ctx.ip, subscription.id);
                const customerId = subscription.customer as string;
                await dao.getUserDao(userId).setUserParams({ customerId });
                await stripe.customers.update(customerId, {
                    metadata: subscription.metadata,
                });
            } else if (subscription.status !== 'incomplete') {
                // not enough to disable pro
                await disablePro(dao, bullQueue, userId, ctx.ip, subscription.id);
            }
            break;
        case 'customer.subscription.deleted':
            await disablePro(dao, bullQueue, userId, ctx.ip, subscription.id);
            break;
    }
    ctx.status = 204;
};

export const enablePro = async (
    dao: Dao,
    queue: Queue,
    userId: string,
    plan: 'friends' | 'pro',
    ip: string,
    subscriptionId: string
) => {
    const userDao = dao.getUserDao(userId);
    const username = await dao.getCachedUsername(userId);

    const wasPro = await userDao.isPro();
    if (plan === 'friends') {
        void dao.userEventDao.logWebEvent(userId, WebEvent.enableFriends, ip, username, subscriptionId);
        await userDao.setUserParams({ pro: '2' });
        await userDao.addFriendCodes();
    } else {
        void dao.userEventDao.logWebEvent(userId, WebEvent.enablePro, ip, username, subscriptionId);
        await userDao.setUserParams({ pro: '1' });
        await disableFriendCodes(dao, queue, userId, ip); // in case the update is a downgrade
    }
    if (UserCategory.enabled === (await userDao.getCategory())) {
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
};

export const disablePro = async (dao: Dao, queue: Queue, userId: string, ip: string, subscriptionId: string) => {
    const userDao = dao.getUserDao(userId);
    const username = await dao.getCachedUsername(userId);

    await dao.userEventDao.logWebEvent(userId, WebEvent.disablePro, ip, username, subscriptionId);

    const wasPro = await userDao.isPro();

    await userDao.setUserParams({ pro: '0' });
    await disableFriendCodes(dao, queue, userId, ip);
    if (UserCategory.vip === (await userDao.getCategory())) {
        await userDao.setCategory(UserCategory.enabled);
    }

    if (wasPro) {
        await queue.add('sendWelcomeMessage', {
            id: Date.now(), // otherwise some seem stuck??
            userId,
            username,
            lostPro: true,
        });
    }
};

const disableFriendCodes = async (dao: Dao, queue: Queue, userId: string, ip: string) => {
    const userDao = dao.getUserDao(userId);
    for (const code of await userDao.getFriendCodes()) {
        if (code.friendId) {
            // disable pro for friends too
            const friendUsername = await dao.getCachedUsername(code.friendId);
            void dao.userEventDao.logWebEvent(
                userId,
                WebEvent.disableFriendRegistration,
                ip,
                friendUsername,
                code.friendId
            );
            void dao.userEventDao.logWebEvent(
                code.friendId,
                WebEvent.disableFriendRegistration,
                ip,
                friendUsername,
                code.userId
            );
            const wasPro = await dao.getUserDao(code.friendId).isPro();
            await dao.getUserDao(code.friendId).setUserParams({ pro: '0' });
            if (UserCategory.vip === (await dao.getUserDao(code.friendId).getCategory())) {
                await dao.getUserDao(code.friendId).setCategory(UserCategory.enabled);
            }

            if (wasPro) {
                await queue.add('sendWelcomeMessage', {
                    id: Date.now(), // otherwise some seem stuck??
                    userId: code.userId,
                    username: friendUsername,
                    lostPro: true,
                });
            }
        }
        await userDao.deleteFriendCodes(code.code);
    }
};

export const generateProCheckoutUrl = async (
    countryCode: string,
    plan: 'pro' | 'friends',
    userId: string,
    username: string
) => {
    if (!stripe) {
        return null;
    }
    const price = getPrice(countryCode);
    const stripeSession = await stripe.checkout.sessions.create({
        billing_address_collection: 'auto',
        line_items: [
            {
                price: plan === 'friends' ? price.friendsId : price.proId,
                quantity: 1,
            },
        ],
        mode: 'subscription',
        subscription_data: {
            metadata: {
                userId,
                username,
            },
            // trial_period_days: 10,
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
};

export const getManageSubscriptionUrl = async (dao: Dao, userId: string) => {
    if (!stripe) {
        return null;
    }
    const customer = (await dao.getUserDao(userId).getUserParams()).customerId;
    if (!customer) {
        return null;
    }
    return (await stripe.billingPortal.sessions.create({ customer })).url;
};

interface Price {
    pro: number | string;
    proId: string;
    friends: number | string;
    friendsId: string;
    name: string;
}

const PRICES: Record<string, Price> = {
    USD: {
        pro: 3,
        proId: 'price_1MuOQwEwrjMfujSG7Tp5hBI0',
        friends: '5.99',
        friendsId: 'price_1MEILOEwrjMfujSGgFOJapDB',
        name: '$',
    },
    EUR: {
        pro: '2.50',
        proId: 'price_1MuOS7EwrjMfujSGNasExS9d',
        friends: '4.99',
        friendsId: 'price_1MEIN4EwrjMfujSGl6qMokU5',
        name: '€',
    },
    IDR: {
        pro: '10 000',
        proId: 'price_1MuORiEwrjMfujSGpAAq54ZV',
        friends: '29 000',
        friendsId: 'price_1MEIPkEwrjMfujSGHk9vU8JU',
        name: 'Rp',
    },
    PHP: {
        pro: 120,
        proId: 'price_1MuOSdEwrjMfujSGIi4EloLv',
        friends: 190,
        friendsId: 'price_1K58dsEwrjMfujSGyAXvzoMz',
        name: '₱',
    },
    BRL: {
        pro: 10,
        proId: 'price_1MuOTJEwrjMfujSGBWjPj5s4',
        friends: 15,
        friendsId: 'price_1KBRdPEwrjMfujSGxfIMGqYq',
        name: 'R$',
    },
    GBP: {
        pro: 2,
        proId: 'price_1MuOTfEwrjMfujSGkDiFlQ2v',
        friends: '3.50',
        friendsId: 'price_1K58jcEwrjMfujSG5qXVO8mB',
        name: '£',
    },
};

const getPrice = (countryCode: string) => {
    let currency;
    try {
        currency = getAllInfoByISO(countryCode).currency;
    } catch {
        currency = 'USD';
    }
    return PRICES[currency] || PRICES.USD;
};

export const getPriceTags = (countryCode: string) => {
    const price = getPrice(countryCode);
    return {
        pro: price.pro + '' + price.name,
        friends: price.friends + '' + price.name,
    };
};
