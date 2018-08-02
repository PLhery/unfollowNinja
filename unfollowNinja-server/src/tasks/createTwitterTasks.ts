import {Job} from 'kue';
import {promisify} from 'util';
import { UserCategory } from '../dao/dao';
import logger from '../utils/logger';
import Task from './task';

// Every three minutes, create checkFollowers tasks
export default class extends Task {
    public async run(job: Job) {
        logger.info('Generating checkFollowers & cacheFollowers tasks...');

        const [ inactiveCheckFTasks, inactiveCacheFTasks] = await Promise.all([
            promisify((cb) => this.queue.inactiveCount('checkFollowers', cb))().then(Number),
            promisify((cb) => this.queue.inactiveCount('cacheFollowers', cb))().then(Number),
        ]);

        if ((inactiveCheckFTasks + inactiveCacheFTasks) > 50) {
            const error = new Error(`There are ${inactiveCheckFTasks} queued checkFollowers` +
                ` and ${inactiveCacheFTasks} queued cacheFollowers.` +
                'Add some more CPUs/Workers! Skipping this check.');
            logger.error(error.message);
            throw error;
        }
        const users: string[] = await this.dao.getUserIdsByCategory(UserCategory.enabled);

        for (const userId of users) {
            const username: string = await this.dao.getCachedUsername(userId);

            await promisify((cb) =>
                this.queue
                .create('checkFollowers', {title: `Check @${username} s followers`, username, userId})
                .removeOnComplete(true)
                .priority('low')
                .save(cb),
            )();

            if (await this.dao.getUserDao(userId).getHasNotCachedFollowers()) {
                await promisify((cb) =>
                    this.queue
                        .create('cacheFollowers', {title: `cache @${username} s followers`, username, userId})
                        .removeOnComplete(true)
                        .priority('low')
                        .save(cb),
                )();
            }
        }
    }
}
