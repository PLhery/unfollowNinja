import Redis from 'ioredis';
import { Sequelize } from 'sequelize';
import RedisMock from 'ioredis-mock';

import Dao, { UserCategory } from '../../src/dao/dao';
import { IUserEgg, IUserParams } from '../../src/utils/types';

const redis: Redis = process.env.REDIS_TEST_URI
    ? new Redis(process.env.REDIS_TEST_URI, { lazyConnect: true })
    : new RedisMock({ lazyConnect: true });

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

const uDao1 = dao.getUserDao('1');
const uDao2 = dao.getUserDao('2');

const USER_PARAMS_1: IUserParams = {
    added_at: 1234,
    lang: 'fr',
    token: 't0k3n',
    tokenSecret: 's3cr3t',
};
const USER_PARAMS_2: IUserParams = {
    added_at: 2345,
    lang: 'en',
    token: 't0k4n',
    tokenSecret: 's2cr2t',
    dmId: '3',
    dmToken: 'token',
    dmTokenSecret: 'secret',
    pro: '1',
    customerId: 'cus_xXx1fff000999fY',
};

describe('Test userDao', () => {
    afterAll(async () => {
        await redis.flushdb();
        await sequelize.drop();
        await dao.disconnect();
    });

    beforeAll(async () => {
        await sequelize.drop();
        await dao.load();
        await redis.flushdb();

        const user1: IUserEgg = {
            ...USER_PARAMS_1,
            id: '1',
            username: 'user 1',
            category: UserCategory.enabled,
        };
        const user2: IUserEgg = {
            ...USER_PARAMS_2,
            id: '2',
            username: 'user 2',
            category: UserCategory.disabled,
        };
        await dao.addUser(user1);
        await dao.addUser(user2);
    });

    test('should get the usernames', async () => {
        expect(await uDao1.getUsername()).toBe('user 1');
        expect(await uDao2.getUsername()).toBe('user 2');
    });

    test('should be able to read and edit the category', async () => {
        expect(await dao.getUserIdsByCategory(UserCategory.enabled)).toStrictEqual(['1']);
        expect(await dao.getUserIdsByCategory(UserCategory.disabled)).toStrictEqual(['2']);
        expect(await dao.getUserIdsByCategory(UserCategory.revoked)).toStrictEqual([]);
        expect(await uDao1.getCategory()).toBe(UserCategory.enabled);
        expect(await uDao2.getCategory()).toBe(UserCategory.disabled);

        await uDao1.setCategory(UserCategory.revoked);

        expect(await dao.getUserIdsByCategory(UserCategory.enabled)).toStrictEqual([]);
        expect(await dao.getUserIdsByCategory(UserCategory.disabled)).toStrictEqual(['2']);
        expect(await dao.getUserIdsByCategory(UserCategory.revoked)).toStrictEqual(['1']);
        expect(await uDao1.getCategory()).toBe(UserCategory.revoked);
        expect(await uDao2.getCategory()).toBe(UserCategory.disabled);

        await uDao1.enable();
        expect(await uDao1.getCategory()).toBe(UserCategory.enabled);
    });

    test('should be able to save the next time to check', async () => {
        expect(await uDao1.getNextCheckTime()).toBe(0); // defaults to 0
        await uDao1.setNextCheckTime(123);
        await uDao2.setNextCheckTime(234);
        await uDao2.setNextCheckTime(345);
        expect(await uDao1.getNextCheckTime()).toBe(123);
        expect(await uDao2.getNextCheckTime()).toBe(345);
    });

    test('should be able to fetch and edit user params', async () => {
        const uParamsStr1 = {
            ...USER_PARAMS_1,
            added_at: 1234,
            dmId: '',
            dmToken: '',
            dmTokenSecret: '',
            customerId: '',
            pro: '0',
        };
        const uParamsStr2 = { ...USER_PARAMS_2, added_at: 2345, pro: '1' };
        expect(await uDao1.getUserParams()).toStrictEqual(uParamsStr1);
        expect(await uDao2.getUserParams()).toStrictEqual(uParamsStr2);

        const newParams = {
            dmId: '3030',
            dmToken: 'token2',
            dmTokenSecret: 'secret2',
            token: 't0k4n2',
            tokenSecret: 's2cr2t2',
        };
        await uDao2.setUserParams(newParams);
        expect(await uDao2.getUserParams()).toStrictEqual({
            ...uParamsStr2,
            ...newParams,
        });
        await uDao2.setUserParams(USER_PARAMS_2);
        expect(await uDao2.getUserParams()).toStrictEqual(uParamsStr2);
    });

    test('should be able to get a Twit instance for each user', async () => {
        process.env.CONSUMER_KEY = 'ckey';
        process.env.CONSUMER_SECRET = 'csecret';
        const twit1 = await uDao1.getTwitterApi();
        const twit2 = await uDao2.getTwitterApi();

        expect(twit1.getActiveTokens()).toStrictEqual({
            appKey: 'ckey',
            appSecret: 'csecret',
            accessToken: USER_PARAMS_1.token,
            accessSecret: USER_PARAMS_1.tokenSecret,
            type: 'oauth-1.0a',
        });
        expect(twit2.getActiveTokens()).toStrictEqual({
            appKey: 'ckey',
            appSecret: 'csecret',
            accessToken: USER_PARAMS_2.token,
            accessSecret: USER_PARAMS_2.tokenSecret,
            type: 'oauth-1.0a',
        });
    });

    test('should be able to get a dmTwit instance for each user', async () => {
        process.env.DM_CONSUMER_KEY = 'dmckey';
        process.env.DM_CONSUMER_SECRET = 'dmcsecret';
        const dmTwit2 = await uDao2.getDmTwitterApi();

        expect(dmTwit2.getActiveTokens()).toStrictEqual({
            appKey: 'dmckey',
            appSecret: 'dmcsecret',
            accessToken: USER_PARAMS_2.dmToken,
            accessSecret: USER_PARAMS_2.dmTokenSecret,
            type: 'oauth-1.0a',
        });
        await expect(uDao1.getDmTwitterApi()).rejects.toThrow("the user didn't have any DM credentials stored");
    });

    test('should be able to get the language', async () => {
        expect(await uDao1.getLang()).toBe('fr');
        expect(await uDao2.getLang()).toBe('en');
    });

    test('isPro', async () => {
        expect(await uDao1.isPro()).toBe(false);
        expect(await uDao2.isPro()).toBe(true);
    });

    test('should store and retrieve a list of followers', async () => {
        expect(await uDao1.getFollowers()).toBeNull();

        await uDao1.updateFollowers(['1', '2', '3'], ['1', '2', '3'], [], 123000);
        await uDao1.updateFollowers(['1', '4'], ['4'], ['2', '3'], 456000);

        expect(await uDao1.getFollowers()).toStrictEqual(['1', '4']);
        expect(await redis.get('followers:count:1')).toBe('2');
        expect(await uDao1.getFollowDetectedTime('1')).toBe(123000);
        expect(await uDao1.getFollowDetectedTime('2')).toBeNull();
        expect(await uDao1.getFollowDetectedTime('3')).toBeNull();
        expect(await uDao1.getFollowDetectedTime('4')).toBe(456000);
        expect(await uDao1.getFollowTime('4')).toBe(456000);
        expect(await redis.get('total-unfollowers')).toBe('2');
    });

    test('should store snowflake IDs', async () => {
        await uDao1.setFollowerSnowflakeId('1', '1654482657084000');
        await uDao1.setFollowerSnowflakeId('4', '1654482657084000');
        expect(await uDao1.getFollowerSnowflakeId('1')).toBe('1654482657084000');
        expect(await uDao1.getCachedFollowers()).toEqual(['1', '4']);
        expect(await uDao1.getFollowTime('1')).toBe(1577837617); // uses snowflake this time

        await uDao1.updateFollowers(['1'], [], ['4'], 456000);
        expect(await uDao1.getCachedFollowers()).toEqual(['1']);
        expect(await uDao1.getFollowerSnowflakeId('4')).toBeNull();
        await uDao1.updateFollowers(['1', '4'], ['4'], [], 456000);
        expect(await uDao1.getCachedFollowers()).toEqual(['1']);
        expect(await uDao1.getFollowerSnowflakeId('4')).toBeNull();
    });

    test('should manage cached/uncached followers', async () => {
        expect(await uDao1.getHasNotCachedFollowers()).toBe(true);

        await uDao1.setFollowerSnowflakeId('1', '1654482657084000');
        expect(await uDao1.getHasNotCachedFollowers()).toBe(true);

        await uDao1.addUncachableFollower('4');
        expect(await uDao1.getHasNotCachedFollowers()).toBe(false);
        expect(await uDao1.getUncachableFollowers()).toEqual(['4']);
    });

    test('should be able to store scrapped followers', async () => {
        expect(await uDao1.getTemporaryFollowerList()).toBe(null);

        await uDao1.setTemporaryFollowerList('1', ['2', '3']);
        expect(await uDao1.getTemporaryFollowerList()).toStrictEqual({ nextCursor: '1', followers: ['2', '3'] });

        await uDao1.deleteTemporaryFollowerList();
        expect(await uDao1.getTemporaryFollowerList()).toBe(null);
    });

    test('should manage friend codes', async () => {
        expect(await uDao1.getFriendCodes()).toHaveLength(0);
        await uDao1.addFriendCodes();
        await uDao2.addFriendCodes();
        await uDao1.addFriendCodes(); // the second call should not do anything
        const codes = await uDao1.getFriendCodes();
        expect(codes).toHaveLength(5);
        expect(codes[0].userId).toBe('1');
        expect(codes[0].code).toHaveLength(6);

        expect(await uDao2.registerFriendCode('AAAAAA')).toBe(false);
        expect(await uDao2.registerFriendCode(codes[1].code)).toBe(true);
        expect(await uDao2.registerFriendCode(codes[1].code)).toBe(false);
        expect((await uDao2.getRegisteredFriendCode())?.userId).toBe('1');

        await uDao2.deleteFriendCodes(codes[1].code);
        expect(await uDao1.getFriendCodes()).toHaveLength(5);
        expect(await uDao2.getFriendCodes()).toHaveLength(5);

        await uDao1.deleteFriendCodes(codes[1].code);
        expect(await uDao1.getFriendCodes()).toHaveLength(4);
        expect(await uDao2.getFriendCodes()).toHaveLength(5);
        expect(await uDao2.getRegisteredFriendCode()).toBe(null);
    });

    // depends heavily on other tests
    test('should get a stable getAllUserData', async () => {
        const data = await uDao1.getAllUserData();
        delete data.friendCodes; // not stable
        delete data.registeredFriendCode; // not stable
        expect(data).toMatchSnapshot();
    });

    test('should completely delete data about the user', async () => {
        expect(await redis.dbsize()).toBe(8);
        await uDao1.deleteUser();
        await uDao2.deleteUser();
        expect(await redis.zcard('users')).toBe(0);
        await redis.del('users'); // empty users appears as a key on ioredis-mock but not on actual redis 6
        expect((await redis.keys('*')).sort()).toEqual(['total-unfollowers']);
    });
});
