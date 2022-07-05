import Redis from 'ioredis';
import Dao from '../dao/dao';

// ran once (while it was in beta) to fix an inconsistency in the DB
async function run() {
    const redis = new Redis();
    const dao = new Dao(redis);
    const userIds = await dao.getUserIds();
    for (const userId of userIds) {
        await redis.del(`followers:follow-time::${userId}`); // typo
        await redis.del(`followers:snowflake-ids:${userId}`); // inconsistency
    }
    redis.disconnect();
}
run().catch((err) => console.error(err));
