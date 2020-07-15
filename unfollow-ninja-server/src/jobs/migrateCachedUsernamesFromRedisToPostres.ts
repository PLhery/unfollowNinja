import Redis from 'ioredis';
import {DataTypes, Sequelize} from 'sequelize';

import Dao from '../dao/dao';
import logger from '../utils/logger';

// migrate cachedTwittos from redis to postgresql
async function run() {
    const redis = new Redis(process.env.REDIS_URI, { lazyConnect: true });
    const sequelize = new Sequelize(process.env.POSTGRES_URI, { logging: false });
    const dao = new Dao(redis, sequelize);
    await dao.load();

    const CachedUsername = sequelize.define('CachedUsername', {
        twitterId: { type: DataTypes.STRING(30), allowNull: false, primaryKey: true },
        username: { type: DataTypes.STRING(15), allowNull: false }
    });

    let cursor = '0';
    const total = await redis.hlen('cachedTwittos');
    let progress = 0;
    do {
        // const [nextCursor, results] = ['0', ['123:username', 'pl', '124:username', 'pl2']];
        const [nextCursor, results] = await redis.hscan('cachedTwittos', cursor);
        cursor = nextCursor;

        const usersToAdd = [];
        for (let i=0;i<results.length;i+=2) {
            const twitterId = results[i].slice(0,-9); // remove the trailing :username
            const username = results[i+1];
            usersToAdd.push({twitterId, username});
        }
        await CachedUsername.bulkCreate(usersToAdd, { ignoreDuplicates: true });

        progress += usersToAdd.length;
        logger.info(`${progress}/${total} twittos migrated`);
    } while (cursor !== '0')
}
run().catch((error) => logger.error(error));
