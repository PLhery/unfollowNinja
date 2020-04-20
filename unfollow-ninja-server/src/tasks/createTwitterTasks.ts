import * as Sentry from '@sentry/node';
import {Job} from 'kue';
import {promisify} from 'util';
import { UserCategory } from '../dao/dao';
import logger from '../utils/logger';
import metrics from '../utils/metrics';
import Task from './task';

// Every three minutes, create checkFollowers tasks
export default class extends Task {
    public async run(job: Job) {
        logger.info('Generating checkFollowers & cacheFollowers tasks...');

        const [inactiveCheckFTasks, inactiveCacheFTasks] = await Promise.all([
            promisify((cb) => this.queue.inactiveCount('checkFollowers', cb))().then(Number),
            promisify((cb) => this.queue.inactiveCount('cacheFollowers', cb))().then(Number),
        ]);

        if ((inactiveCheckFTasks + inactiveCacheFTasks) > 50) {
            const error = new Error(`There are ${inactiveCheckFTasks} queued checkFollowers` +
                ` and ${inactiveCacheFTasks} queued cacheFollowers.` +
                'Add some more CPUs/Workers! Skipping this check.');
            logger.error(error.message);
            Sentry.withScope(scope => {
                scope.setFingerprint(['tooManyQueuedItems']);
                Sentry.captureException(error);
            });
            return;
        }
        // metrics
        for (const [category, count] of Object.entries(await this.dao.getUserCountByCategory())) {
            metrics.gauge(`uninja.users.${UserCategory[category]}`, count)
        }

        const users: string[] = await this.dao.getUserIdsByCategory(UserCategory.enabled);

        for (const [index, userId] of users.entries()) {
            const username: string = await this.dao.getCachedUsername(userId);

            let metric;
            if (index === users.length - 1) {
                metric = {name: 'uninja.check-duration.last', from: job.started_at};
            } else if (index === 30000) {
                metric = {name: 'uninja.check-duration.30000th', from: job.started_at};
            }
            const jobData = metric ? {username, userId, metric} : {username, userId};
            await promisify((cb) =>
                this.queue
                .create('checkFollowers', jobData)
                .removeOnComplete(true)
                .priority('low')
                .save(cb),
            )();

            if (await this.dao.getUserDao(userId).getHasNotCachedFollowers()) {
                await promisify((cb) =>
                    this.queue
                        .create('cacheFollowers', {username, userId})
                        .removeOnComplete(true)
                        .priority('low')
                        .save(cb),
                )();
            }
        }
    }
}
