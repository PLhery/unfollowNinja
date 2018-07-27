import { DoneCallback, Job } from 'kue';
import { promisify } from 'util';
import logger from '../utils/logger';
import Task from './task';

// Every three minutes, create checkFollowers tasks
export default class extends Task {
    public async run(job: Job,  done: DoneCallback) {
        logger.info('Generating checkFollowers tasks...');

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
        }

        done();
    }
}
