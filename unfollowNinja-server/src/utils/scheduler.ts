import { Redis } from 'ioredis';
import { Queue } from 'kue';
import logger from './logger';

// Launch createTwitterTasks every 3 minutes
export default class Scheduler {
    private schedulerId: number;
    private redis: Redis;
    private queue: Queue;
    private intervalId: NodeJS.Timer;
    private started: boolean;

    constructor(redis: Redis, queue: Queue) {
        this.redis = redis;
        this.queue = queue;
        this.started = false;
    }

    public start() {
        if (this.started) {
            return;
        }
        this.started = true;
        // makes sure that only one scheduler is running (the app could be launched twice)
        this.redis.incr('scheduler_id')
            .then((value) => {
                this.schedulerId = value;

                // every 3 minutes, create the checkFollowers tasks for everyone
                this.intervalId = setInterval(() => this.createTwitterTasks(), 3 * 60 * 1000);
                this.createTwitterTasks();
            });
    }

    private createTwitterTasks() {
        this.redis.get('scheduler_id')
            .then((lastSchedulerId) => {
                if (parseInt(lastSchedulerId, 10) !== this.schedulerId) {
                    logger.warn('A new scheduler has been launched, cancelling this one...');
                    clearInterval(this.intervalId);
                    return;
                }
                this.queue
                    .create('createTwitterTasks', {})
                    .removeOnComplete(true)
                    .save();
            });
    }
}
