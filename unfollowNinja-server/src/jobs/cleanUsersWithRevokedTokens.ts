import * as fs from 'fs';
import Dao, {UserCategory} from '../dao/dao';
import logger from '../utils/logger';

// Backup and delete for Redis users that revoked their tokens
async function runJob() {
    const dao = new Dao();
    const userIds = await dao.getUserIdsByCategory(UserCategory.revoked);
    logger.info(`${userIds.length}`);
    const userDatas = [];
    const now = Date.now();
    let i = 0;
    for (const userId of userIds) {
        logger.info(`processing ${userId} (${++i}/${userIds.length}...`);
        const userDao = dao.getUserDao(userId);
        userDatas.push(await userDao.getAllUserData());
        fs.writeFileSync(`./logs/export${now}.json`, JSON.stringify(userDatas));
        await userDao.deleteUser();
    }
    dao.disconnect();
}

runJob();
