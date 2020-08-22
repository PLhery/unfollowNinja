import Redis from 'ioredis';
import { Sequelize } from 'sequelize';
// @ts-ignore
import RedisMock from 'ioredis-mock'; // @types/ioredis-mock doesn't exist yet
import Dao, {UserCategory} from '../../src/dao/dao';
import { IUserEgg } from '../../src/utils/types';

const redis = process.env.REDIS_TEST_URI ?
    new Redis(process.env.REDIS_TEST_URI, { lazyConnect: true }) :
    new RedisMock({ lazyConnect: true });

const sequelize = process.env.POSTGRES_TEST_URI ?
    new Sequelize(process.env.POSTGRES_TEST_URI, { logging: false }) :
    new Sequelize( { dialect: 'sqlite', storage: ':memory:', logging: false});

const dao = new Dao(redis, sequelize);

describe('Test DAO', () => {
    beforeAll(async () => {
        await sequelize.drop();
        await dao.load();
    });

    beforeEach(async () => {
        await redis.flushdb();
    });

    afterAll(async () => {
        await redis.flushdb();
        await sequelize.drop();
        await dao.disconnect();
    });

    test('should manage users', async () => {
        const user1: IUserEgg = {
            id: '1000000000000001',
            username: 'user 1',
            added_at: 1234,
            lang: 'fr',
            token: 't0k3n',
            tokenSecret: 's3cr3t',
        };
        const user2: IUserEgg = {...user1, id: '2', category: UserCategory.disabled};
        await dao.addUser(user1);
        await dao.addUser(user2);

        expect(await dao.getUserIds()).toStrictEqual(['1000000000000001', '2']);
        expect(await dao.getUserIdsByCategory(UserCategory.enabled)).toStrictEqual(['1000000000000001']);
        expect(await dao.getUserIdsByCategory(UserCategory.disabled)).toStrictEqual(['2']);
        expect(await dao.getUserIdsByCategory(UserCategory.suspended)).toStrictEqual([]);
        expect(await dao.getCachedUsername('2')).toBe('user 1');
        expect(await dao.getUserCountByCategory()).toStrictEqual( {0: 1, 1: 0, 2: 0, 3: 1, 4: 0, 5: 0, 6: 0});
    });

    test('should manage username cache', async () => {
        await dao.addTwittoToCache({id: '3', username: 'boule'});
        await dao.addTwittoToCache({id: '4', username: 'et'});
        await dao.addTwittoToCache({id: '4', username: 'bill'});
        expect(await dao.getCachedUsername('3')).toBe('boule');
        expect(await dao.getCachedUsername('4')).toBe('bill');
        expect(await dao.getCachedUsername('5')).toBeNull();
    });

    test('should manage sessions', async () => {
        expect(await dao.getSession('12345')).toEqual({});
        await dao.setSession('12345', {hello:'world1'});
        await dao.setSession('23456', {hello:'world2'});
        expect(await dao.getSession('12345')).toEqual({hello:'world1'});
    });

    test('should manage API s tokenSecret', async () => {
        expect(await dao.getTokenSecret('12345')).toBeNull();
        await dao.setTokenSecret('12345', 'secret1');
        await dao.setTokenSecret('23456', 'secret2');
        expect(await dao.getTokenSecret('12345')).toEqual('secret1');
    });
});
