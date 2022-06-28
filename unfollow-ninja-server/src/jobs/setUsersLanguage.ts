import Dao from '../dao/dao';
import logger from '../utils/logger';

// Following a bug, some unfollowMonkey users have language: fr in their settings. Set it back to fr
async function runJob() {
    const dao = await new Dao().load();
    const userIds = await dao.getUserIds();
    logger.info(`${userIds.length}`);
    let i = 0;
    for (const userId of userIds) {
        logger.info(`processing ${userId} (${++i}/${userIds.length}...`);
        const userDao = dao.getUserDao(userId);
        const lang = await userDao.getLang();
        if (lang !== 'en') {
            logger.info('overriding lang for user ' + userId);
            await userDao.setUserParams({ lang: 'en' });
        }
    }
    dao.disconnect();
}

runJob();
