import { Job } from 'kue';
import { promisify } from 'util';
import logger from '../utils/logger';
import Task from './task';

// Every three minutes, create checkFollowers tasks
export default class extends Task {
    public async run(job: Job) {
        logger.info('Generating checkFollowers & cacheFollowers tasks...');

        const inactiveCheckFTasks = Number(await promisify((cb) => this.queue.inactiveCount('checkFollowers', cb))());
        const inactiveCacheFTasks = Number(await promisify((cb) => this.queue.inactiveCount('cacheFollowers', cb))());
        if ((inactiveCheckFTasks + inactiveCacheFTasks) > 50) {
            const error = new Error(`There are ${inactiveCheckFTasks} queued checkFollowers` +
                ` and ${inactiveCacheFTasks} queued cacheFollowers.` +
                'Add some more CPUs/Workers! Skipping this check.');
            logger.error(error.message);
            throw error;
        }
        const users: string[] = await this.redis.zrange('users:enabled', 0, -1);

        for (const userId of users) {
            const username: string = await this.redis.hget(`cachedTwitto:${userId}`, 'username');

            await promisify((cb) =>
                this.queue
                .create('checkFollowers', {title: `Check @${username} s followers`, username, userId})
                .removeOnComplete(true)
                .priority('low')
                .save(cb),
            )();

            const remainingFollowers = Number(await this.redis.zcard(`followers:not-cached:${userId}`));
            if (remainingFollowers > 0) {
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
