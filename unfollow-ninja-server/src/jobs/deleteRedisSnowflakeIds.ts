import Redis from 'ioredis';

import Dao from '../dao/dao';
import logger from '../utils/logger';
import pLimit from 'p-limit';

// These 3 redis dictionaries have been migrated to postgres
async function run() {
    const redis = new Redis(process.env.REDIS_URI, { lazyConnect: true });
    const dao = new Dao(redis);
    await dao.load();

    const userIds = await dao.getUserIds();

    // handle 15 userIds at a time
    const limit = pLimit(15);
    const limitPromises = userIds.map((userId, progress) =>
        limit(async () => {
            if (progress < 0) {
                return;
            }

            await Promise.all([
                redis.del(`followers:follow-time:${userId}`),
                redis.del(`followers:uncachable:${userId}`),
                redis.del(`followers:snowflake-ids:${userId}`),
            ]);

            if (progress % 10 === 0) {
                logger.info(`${progress}/${userIds.length} twittos migrated`);
            }
        })
    );

    await Promise.all(limitPromises);

    await dao.disconnect();
}
run().catch((error) => logger.error(error));
