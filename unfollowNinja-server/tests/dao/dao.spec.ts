import * as Redis from 'ioredis';
// @ts-ignore
import * as RedisMock from 'ioredis-mock'; // @types/ioredis-mock doesn't exist yet
import Dao, {UserCategory} from '../../src/dao/dao';
import { IUserEgg } from '../../src/utils/types';

const redis = process.env.REDIS_TEST_URI ? new Redis(process.env.REDIS_TEST_URI) : new RedisMock();
const dao = new Dao(redis);

describe('Test DAO', () => {
    beforeEach(async () => {
        await redis.flushdb();
    });

    afterAll(async () => {
        await redis.flushdb();
        await redis.disconnect();
    });

    test('Should have an incrementable schedulerId', async () => {
        await dao.incrSchedulerId();
        await dao.incrSchedulerId();
        await dao.incrSchedulerId();
        const schedulerId = await dao.getSchedulerId();
        expect(schedulerId).toBe(3);
    });

    test('should manage users', async () => {
        const user1: IUserEgg = {
            id: '1000000000000001',
            username: 'user 1',
            added_at: 1234,
            lang: 'fr',
            token: 't0k3n',
            tokenSecret: 's3cr3t',
            photo: 'http://twitter.com/photo.jpg',
        };
        const user2: IUserEgg = {...user1, id: '2', category: UserCategory.disabled};
        await dao.addUser(user1);
        await dao.addUser(user2);

        expect(await dao.getUserIds()).toStrictEqual(['1000000000000001', '2']);
        expect(await dao.getUserIdsByCategory(UserCategory.enabled)).toStrictEqual(['1000000000000001']);
        expect(await dao.getUserIdsByCategory(UserCategory.disabled)).toStrictEqual(['2']);
        expect(await dao.getUserIdsByCategory(UserCategory.suspended)).toStrictEqual([]);
        expect(await dao.getCachedUsername('2')).toBe('user 1');
    });

    test('should manage username cache', async () => {
        await dao.addTwittoToCache({id: '3', username: 'boule'});
        await dao.addTwittoToCache({id: '4', username: 'et'});
        await dao.addTwittoToCache({id: '4', username: 'bill'});
        expect(await dao.getCachedUsername('3')).toBe('boule');
        expect(await dao.getCachedUsername('4')).toBe('bill');
        expect(await dao.getCachedUsername('5')).toBeNull();

        expect(await redis.zcard('cachedTwittosIds')).toBe(2);
    });
});
