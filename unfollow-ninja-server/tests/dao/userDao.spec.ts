import Redis from 'ioredis';
// @ts-ignore
import RedisMock from 'ioredis-mock'; // @types/ioredis-mock doesn't exist yet
import Dao, {UserCategory} from '../../src/dao/dao';
import {IUserEgg, IUserParams} from '../../src/utils/types';

const redis = process.env.REDIS_TEST_URI ? new Redis(process.env.REDIS_TEST_URI) : new RedisMock();
const dao = new Dao(redis);

const uDao1 = dao.getUserDao('1');
const uDao2 = dao.getUserDao('2');

const USER_PARAMS_1: IUserParams = {
    added_at: 1234,
    lang: 'fr',
    token: 't0k3n',
    tokenSecret: 's3cr3t',
    photo: 'http://twitter.com/photo.jpg',
};
const USER_PARAMS_2: IUserParams = {
    added_at: 2345,
    lang: 'en',
    token: 't0k4n',
    tokenSecret: 's2cr2t',
    photo: 'http://twitter.com/image.jpg',
    dmId: '3',
    dmToken: 'token',
    dmTokenSecret: 'secret',
    dmPhoto: 'http://twitter.com/dm.jpg',
};

describe('Test userDao', () => {
    afterAll(async () => {
        await redis.flushdb();
        await redis.disconnect();
    });

    beforeAll(async () => {
        await redis.flushdb();
        const user1: IUserEgg = {
            ...USER_PARAMS_1,
            id: '1',
            username: 'user 1',
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
        const uParamsStr1 = {...USER_PARAMS_1, added_at: 1234, dmId: '', dmPhoto: '', dmToken: '', dmTokenSecret: ''};
        const uParamsStr2 = {...USER_PARAMS_2, added_at: 2345};
        expect(await uDao1.getUserParams()).toStrictEqual(uParamsStr1);
        expect(await uDao2.getUserParams()).toStrictEqual(uParamsStr2);

        const newParams = {dmId: '3030', dmPhoto: '--', dmToken: 'token2', dmTokenSecret: 'secret2',
            photo: 'http://twitter.com/profil.jpg', token: 't0k4n2', tokenSecret: 's2cr2t2'};
        await uDao2.setUserParams(newParams);
        expect(await uDao2.getUserParams()).toStrictEqual({...uParamsStr2, ...newParams});
        await uDao2.setUserParams(USER_PARAMS_2);
        expect(await uDao2.getUserParams()).toStrictEqual(uParamsStr2);
    });

    test('should be able to get a Twit instance for each user', async () => {
        process.env.CONSUMER_KEY = 'ckey';
        process.env.CONSUMER_SECRET = 'csecret';
        const twit1 = await uDao1.getTwit();
        const twit2 = await uDao2.getTwit();

        expect(twit1.getAuth()).toStrictEqual({
            consumer_key: 'ckey',
            consumer_secret: 'csecret',
            access_token: USER_PARAMS_1.token,
            access_token_secret: USER_PARAMS_1.tokenSecret,
        });
        expect(twit2.getAuth()).toStrictEqual({
            consumer_key: 'ckey',
            consumer_secret: 'csecret',
            access_token: USER_PARAMS_2.token,
            access_token_secret: USER_PARAMS_2.tokenSecret,
        });
    });

    test('should be able to get a dmTwit instance for each user', async () => {
        process.env.DM_CONSUMER_KEY = 'dmckey';
        process.env.DM_CONSUMER_SECRET = 'dmcsecret';
        const dmTwit2 = await uDao2.getDmTwit();

        expect(dmTwit2.getAuth()).toStrictEqual({
            consumer_key: 'dmckey',
            consumer_secret: 'dmcsecret',
            access_token: USER_PARAMS_2.dmToken,
            access_token_secret: USER_PARAMS_2.dmTokenSecret,
        });
        await expect(uDao1.getDmTwit()).rejects.toThrow('the user didn\'t have any DM credentials stored');
    });

    test('should be able to get the language', async () => {
        expect(await uDao1.getLang()).toBe('fr');
        expect(await uDao2.getLang()).toBe('en');
    });

    test('should store and retrieve a list of followers', async () => {
        expect(await uDao1.getFollowers()).toBeNull();

        await uDao1.updateFollowers(['1', '2', '3'], ['1', '2', '3'], [], 123);
        await uDao1.updateFollowers(['1', '4'], ['4'], ['2', '3'], 456);

        expect(await uDao1.getFollowers()).toStrictEqual(['1', '4']);
        expect(await redis.get('followers:count:1')).toBe('2');
        expect(await uDao1.getFollowDetectedTime('1')).toBe(123);
        expect(await uDao1.getFollowDetectedTime('2')).toBe(0);
        expect(await uDao1.getFollowDetectedTime('3')).toBe(0);
        expect(await uDao1.getFollowDetectedTime('4')).toBe(456);
        expect(await uDao1.getFollowTime('4')).toBe(456);
        expect(await redis.get('total-unfollowers')).toBe('2');
    });

    test('should store snowflake IDs', async () => {
        await uDao1.setFollowerSnowflakeId('1', '1654482657084000');
        await uDao1.setFollowerSnowflakeId('4', '1654482657084000');
        expect(await uDao1.getFollowerSnowflakeId('1')).toBe('1654482657084000');
        expect(await uDao1.getCachedFollowers()).toStrictEqual(['1', '4']);
        expect(await uDao1.getFollowTime('1')).toBe(1577837617); // uses snowflake this time

        await uDao1.removeFollowerSnowflakeIds(['1']);
        expect(await uDao1.getFollowerSnowflakeId('1')).toBeNull();
        expect(await uDao1.getCachedFollowers()).toStrictEqual(['4']);
    });

    test('should manage cached/uncached followers', async () => {
        expect(await uDao1.getHasNotCachedFollowers()).toBe(true);

        await uDao1.setFollowerSnowflakeId('4', '1654482657084000');
        expect(await uDao1.getHasNotCachedFollowers()).toBe(true);

        await uDao1.addUncachableFollower('1');
        expect(await uDao1.getHasNotCachedFollowers()).toBe(false);
        expect(await uDao1.getUncachableFollowers()).toStrictEqual(['1']);
    });

    // depends heavily on other tests
    test('should get a stable getAllUserData', async () => {
        expect(await uDao1.getAllUserData()).toMatchSnapshot();
    });

    test('should completely delete data about the user', async () => {
        expect(await redis.dbsize()).toBe(13);
        await uDao1.deleteUser();
        await uDao2.deleteUser();
        expect(await redis.dbsize()).toBe(4); // users, cachedTwittosIds, cachedTwittos, total-unfollowers
    });
});
