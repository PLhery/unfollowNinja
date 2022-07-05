import Dao, { UserCategory } from '../dao/dao';
import logger from '../utils/logger';

// Backup and delete for Redis users that revoked their tokens
async function runJob() {
    const dao = await new Dao().load();
    const userIds = await dao.getUserIdsByCategory(UserCategory.revoked);
    userIds.push(...(await dao.getUserIdsByCategory(UserCategory.disabled)));
    logger.info(`${userIds.length}`);
    let i = 0;
    for (const userId of userIds) {
        logger.info(`processing ${userId} (${++i}/${userIds.length}...`);
        const userDao = dao.getUserDao(userId);
        await userDao.cleanUser();
    }
    await dao.disconnect();
}

runJob().catch((err) => console.error(err));
