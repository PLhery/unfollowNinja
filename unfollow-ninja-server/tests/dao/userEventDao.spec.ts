import Redis from 'ioredis';
import { Sequelize } from 'sequelize';
import RedisMock from 'ioredis-mock';

import Dao, { UserCategory } from '../../src/dao/dao';
import { FollowEvent, NotificationEvent, WebEvent } from '../../src/dao/userEventDao'; // @types/ioredis-mock doesn't exist yet

const redis = process.env.REDIS_TEST_URI
    ? new Redis(process.env.REDIS_TEST_URI, { lazyConnect: true })
    : new (RedisMock as typeof Redis)({ lazyConnect: true });

const sequelize = process.env.POSTGRES_TEST_URI
    ? new Sequelize(process.env.POSTGRES_TEST_URI, { logging: false })
    : new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });

const sequelizeLogs = process.env.POSTGRES_LOGS_TEST_URI
    ? new Sequelize(process.env.POSTGRES_LOGS_TEST_URI, { logging: false })
    : new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });

const sequelizeFollowers = process.env.POSTGRES_FOLLOWERS_TEST_URI
    ? new Sequelize(process.env.POSTGRES_FOLLOWERS_TEST_URI, { logging: false })
    : new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });

const dao = new Dao(redis, sequelize, sequelizeLogs, sequelizeFollowers);
const userEventDao = dao.userEventDao;

describe('Test UserEventDAO', () => {
    beforeAll(async () => {
        await sequelizeLogs.drop();
        await dao.load();
    });

    afterAll(async () => {
        await sequelizeLogs.drop();
        await dao.disconnect();
    });

    // because logWebEvent doesn't have any await, these tests can be flacky when run on docker
    jest.retryTimes(5);

    test('should log webEvents', async () => {
        await userEventDao.logWebEvent('user1', WebEvent.signIn, '127.0.0.1', 'username1');
        await userEventDao.logWebEvent('user1', WebEvent.addDmAccount, '127.0.0.2', 'username2', 'user2');
        await userEventDao.logWebEvent('user2', WebEvent.signIn, '127.0.0.3', 'username2');

        expect(await userEventDao.getWebEvents('user0')).toEqual([]);
        expect(await userEventDao.getWebEvents('user1')).toEqual([
            expect.objectContaining({
                id: 2,
                userId: 'user1',
                event: WebEvent.addDmAccount,
                eventName: 'addDmAccount',
                extraInfo: 'user2',
                ip: '127.0.0.2',
                username: 'username2',
            }),
            expect.objectContaining({
                id: 1,
                userId: 'user1',
                event: WebEvent.signIn,
                eventName: 'signIn',
                extraInfo: null,
                ip: '127.0.0.1',
                username: 'username1',
            }),
        ]);
        expect(await userEventDao.getWebEvents('user2')).toHaveLength(1);
    });

    test('should log followEvent', async () => {
        await userEventDao.logFollowEvent('user1', FollowEvent.followDetected, 'user2', 20);

        expect(await userEventDao.getFollowEvent('user0')).toEqual([]);
        expect(await userEventDao.getFollowEvent('user1')).toEqual([
            expect.objectContaining({
                id: 1,
                userId: 'user1',
                event: FollowEvent.followDetected,
                eventName: 'followDetected',
                followerId: 'user2',
                nbFollowers: 20,
            }),
        ]);
    });

    test('should log unfollowerEvent', async () => {
        await userEventDao.logUnfollowerEvent('user1', false, {
            id: 'user2',
            followTime: 3000,
            unfollowTime: 0,
            followDetectedTime: 5000,
            blocking: true,
            blocked_by: false,
            suspended: true,
            locked: false,
            deleted: true,
            following: false,
            followed_by: true,
            skippedBecauseGlitchy: false,
        });

        expect(await userEventDao.getUnfollowerEvents('user0')).toEqual([]);
        expect(await userEventDao.getUnfollowerEvents('user1')).toEqual([
            expect.objectContaining({
                id: 1,
                userId: 'user1',
                isSecondCheck: false,
                followerId: 'user2',
                followTime: 3,
                followDetectedTime: 5,
                blocking: true,
                blockedBy: false,
                suspended: true,
                locked: false,
                deleted: true,
                following: false,
                followedBy: true,
                skippedBecauseGlitchy: false,
            }),
        ]);
    });

    test('should log notificationEvent', async () => {
        await userEventDao.logNotificationEvent(
            'user1',
            NotificationEvent.unfollowersMessage,
            'user2',
            'someone unfollowed you :('
        );

        expect(await userEventDao.getNotificationEvents('user0')).toEqual([]);
        expect(await userEventDao.getNotificationEvents('user1')).toEqual([
            expect.objectContaining({
                id: 1,
                event: NotificationEvent.unfollowersMessage,
                eventName: 'unfollowersMessage',
                userId: 'user1',
                fromId: 'user2',
                message: 'someone unfollowed you :(',
            }),
        ]);
    });

    test('should log categoryEvent', async () => {
        await dao.getUserDao('user1').setCategory(UserCategory.enabled);
        await dao.getUserDao('user1').setCategory(UserCategory.revoked);

        expect(await userEventDao.getCategoryEvents('user0')).toEqual([]);
        expect(await userEventDao.getCategoryEvents('user1')).toEqual([
            expect.objectContaining({
                id: 2,
                category: UserCategory.revoked,
                categoryName: 'revoked',
                formerCategory: UserCategory.enabled,
                formerCategoryName: 'enabled',
            }),
            expect.objectContaining({
                id: 1,
                category: UserCategory.enabled,
                categoryName: 'enabled',
                formerCategory: UserCategory.disabled,
                formerCategoryName: 'disabled',
            }),
        ]);
    });
});
