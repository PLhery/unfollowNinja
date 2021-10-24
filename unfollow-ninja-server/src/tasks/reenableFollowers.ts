import * as Sentry from '@sentry/node';
import type { Job } from 'bull';

import {UserCategory} from '../dao/dao';
import logger from '../utils/logger';
import metrics from '../utils/metrics';
import Task from './task';
if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
}

const CATEGORIES_TO_CHECK = [
    UserCategory.suspended,
    // UserCategory.revoked, shouldnt be useful
    // UserCategory.dmclosed TODO
];

// reenable followers disabled because they were suspended or had a token issue
export default class extends Task {
    public async run(job: Job) {
        return Promise.all(
            CATEGORIES_TO_CHECK.map(async category => {
                for (const userId of await this.dao.getUserIdsByCategory(category)) {
                    await this.checkAccountValid(userId, category).catch((err) => {
                        logger.error(err);
                        Sentry.withScope(scope => {
                            scope.setTag('task-name', 'reenableFollowers');
                            scope.setUser({id: userId});
                            Sentry.captureException(err);
                        });
                    });
                }
            }),
        ).then(() => {
            metrics.gauge('uninja.reenableFollowers.duration', Date.now() - job.processedOn);
        });
    }

    private async checkAccountValid(userId: string, category: UserCategory) {
        const userDao = this.dao.getUserDao(userId);
        const [ twit, twitDM, username ] =
            await Promise.all([userDao.getTwit(), userDao.getDmTwit(), this.dao.getCachedUsername(userId)]);

        await twit.get('followers/ids')
            .then(() => twitDM.get('followers/ids'))
            .then(() => {
                logger.debug('suspension check - @%s is not ' + UserCategory[category] + ' anymore :)', username);
                metrics.increment('uninja.reenableFollowers.reenabled');
                return userDao.setCategory(UserCategory.enabled);
            })
            .catch(() => {
                logger.debug('suspension check - @%s is still ' + UserCategory[category], username);
            });
    }
}
