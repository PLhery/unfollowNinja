import Redis from 'ioredis';
import { Sequelize } from 'sequelize';
// @ts-ignore
import RedisMock from 'ioredis-mock';

import Dao from '../../src/dao/dao';
import { WebEvent } from '../../src/dao/userEventDao'; // @types/ioredis-mock doesn't exist yet

const redis = process.env.REDIS_TEST_URI ?
    new Redis(process.env.REDIS_TEST_URI, { lazyConnect: true }) :
    new RedisMock({ lazyConnect: true });

const sequelize = process.env.POSTGRES_TEST_URI ?
  new Sequelize(process.env.POSTGRES_TEST_URI, { logging: false }) :
  new Sequelize( { dialect: 'sqlite', storage: ':memory:', logging: false});

const sequelizeLogs = process.env.POSTGRES_LOGS_TEST_URI ?
  new Sequelize(process.env.POSTGRES_LOGS_TEST_URI, { logging: false }) :
  new Sequelize( { dialect: 'sqlite', storage: ':memory:', logging: false });

const dao = new Dao(redis, sequelize, sequelizeLogs);
const userEventDao = dao.userEventDao

describe('Test UserEventDAO', () => {
    beforeAll(async () => {
        await sequelizeLogs.drop();
        await dao.load();
    });

    afterAll(async () => {
        await sequelizeLogs.drop();
        await dao.disconnect();
    });

    test('should log webEvents', async () => {
      userEventDao.logWebEvent('user1', WebEvent.signIn, '127.0.0.1', 'username1');
      userEventDao.logWebEvent('user1', WebEvent.addDmAccount, '127.0.0.2', 'username2', 'user2');
      userEventDao.logWebEvent('user2', WebEvent.signIn, '127.0.0.3', 'username2');

      expect(await userEventDao.getWebEvents('user0')).toEqual([]);
      expect(await userEventDao.getWebEvents('user1')).toEqual([
        expect.objectContaining({
          'event': 1,
          'eventName': 'signIn',
          'extraInfo': null,
          'id': 1,
          'ip': '127.0.0.1',
          'userId': 'user1',
          'username': 'username1'
        }),
        expect.objectContaining({
          'event': 2,
          'eventName': 'addDmAccount',
          'extraInfo': 'user2',
          'id': 2,
          'ip': '127.0.0.2',
          'userId': 'user1',
          'username': 'username2'
        })
      ]);
      expect(await userEventDao.getWebEvents('user2')).toHaveLength(1);
    });
});
