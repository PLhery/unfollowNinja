import { Redis } from 'ioredis';
import { createQueue, DoneCallback, Job } from 'kue';
import logger from '../utils/logger';
import Task from './task';

// Every three minutes, create checkFollowers tasks
export default class extends Task {
    public run(job: Job,  done: DoneCallback) {
        logger.info('Generating checkFollowers tasks...');

        // get followers
        for (let i = 0; i < 10; i++) {
            this.queue.create('checkFollowers', {title: 'Check plhery s followers', username: 'plhery' + i}).save();
        }

        done();
    }
}
