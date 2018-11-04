import {Job} from 'kue';

import {UserCategory} from '../dao/dao';
import logger from '../utils/logger';
import Task from './task';

// reenable followers disabled because they were suspended
export default class extends Task {
    public async run(job: Job) {
        const userIds = await this.dao.getUserIdsByCategory(UserCategory.suspended);

        for (const userId of userIds) {
            const userDao = this.dao.getUserDao(userId);
            const [ twit, twitDM, username ] =
                await Promise.all([userDao.getTwit(), userDao.getDmTwit(), this.dao.getCachedUsername(userId)]);

            await twit.get('followers/ids')
                .then(() => twitDM.get('followers/ids'))
                .then(() => {
                    logger.debug('suspension check - @%s is not suspended anymore :)', username);
                    return userDao.setCategory(UserCategory.enabled);
                })
                .catch(() => {
                    logger.debug('suspension check - @%s is still suspended', username);
                });
        }
    }
}
