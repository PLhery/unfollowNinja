import * as Sentry from '@sentry/node';
import type { Job } from 'bull';

import { UserCategory } from '../dao/dao';
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
    public run(job: Job) {
        return Promise.all(
            CATEGORIES_TO_CHECK.map(async (category) => {
                for (const userId of await this.dao.getUserIdsByCategory(category)) {
                    await this.checkAccountValid(userId).catch((err) => {
                        logger.error(err);
                        Sentry.withScope((scope) => {
                            scope.setTag('task-name', 'reenableFollowers');
                            scope.setUser({ id: userId });
                            Sentry.captureException(err);
                        });
                    });
                }
            })
        ).then(() => {
            metrics.gauge('reenableFollowers.duration', Date.now() - job.processedOn);
        });
    }

    private async checkAccountValid(userId: string) {
        const userDao = this.dao.getUserDao(userId);
        const twitterApi = await userDao.getTwitterApi();
        if (!(await userDao.isPro())) {
            // check only pro users
            return;
        }

        await twitterApi.v2
            .following('1162323988493799424')
            .then(() => {
                metrics.increment('reenableFollowers.reenabled');
                return userDao.enable();
            })
            .catch(() => null);
    }
}
