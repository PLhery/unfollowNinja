import { Queue } from 'kue';
import { promisify } from 'util';
import Dao from '../dao/dao';
import logger from './logger';

const MINUTES_BETWEEN_CHECKS = Number(process.env.MINUTES_BETWEEN_CHECKS) || 2;

// Launch createTwitterTasks every 3 minutes
export default class Scheduler {
    private schedulerId: number;
    private dao: Dao;
    private queue: Queue;
    private intervalId: NodeJS.Timer;
    private started: boolean;

    constructor(dao: Dao, queue: Queue) {
        this.dao = dao;
        this.queue = queue;
        this.started = false;
    }

    public async start(): Promise<void> {
        if (this.started) {
            return;
        }
        this.started = true;
        // makes sure that only one scheduler is running (the app could be launched twice)
        this.schedulerId = await this.dao.incrSchedulerId();

        // every 2 minutes, create the checkFollowers tasks for everyone
        this.intervalId = setInterval(() => this.createTwitterTasks(), MINUTES_BETWEEN_CHECKS * 60 * 1000);
        await this.createTwitterTasks();

        // twice a day, reenable suspended followers
        this.intervalId = setInterval(() => this.createDailyTasks(), 12 * 60 * 60 * 1000);
        await this.createDailyTasks();
    }

    public stop() {
        if (!this.started) {
            return;
        }
        clearInterval(this.intervalId);
        this.started = false;
    }

    private async createTwitterTasks(): Promise<void> {
        if (await this.dao.getSchedulerId() !== this.schedulerId) {
            logger.warn('A new scheduler has been launched, cancelling this one...');
            this.stop();
            return;
        }
        await promisify((cb) => this.queue
            .create('createTwitterTasks', {})
            .removeOnComplete(true)
            .save(cb))();
    }

    private async createDailyTasks(): Promise<void> {
        if (await this.dao.getSchedulerId() !== this.schedulerId) {
            logger.warn('A new scheduler has been launched, cancelling this one...');
            this.stop();
            return;
        }
        await promisify((cb) => this.queue
            .create('reenableFollowers', {})
            .removeOnComplete(true)
            .save(cb))();
    }
}
