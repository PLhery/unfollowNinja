import { Queue } from 'kue';
import { promisify } from 'util';
import * as Sentry from '@sentry/node';
import Dao, {UserCategory} from '../dao/dao';
import metrics from './metrics';

// Launch createTwitterTasks every 3 minutes
export default class Scheduler {
    private dao: Dao;
    private queue: Queue;
    private intervalId: NodeJS.Timer;
    private dailyIntervalId: NodeJS.Timer;
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

        // every minute, update the user count metrics
        this.intervalId = setInterval(() => this.updateUserCountMetrics(), 60 * 1000);
        this.updateUserCountMetrics();

        // twice a day, reenable suspended followers
        this.dailyIntervalId = setInterval(() => this.createTriHourlyTasks(), 3 * 60 * 60 * 1000);
        this.createTriHourlyTasks();
    }

    public stop() {
        if (!this.started) {
            return;
        }
        clearInterval(this.intervalId);
        clearInterval(this.dailyIntervalId);
        this.started = false;
    }

    private async updateUserCountMetrics(): Promise<void> {
        try {
            for (const [category, count] of Object.entries(await this.dao.getUserCountByCategory())) {
                metrics.gauge(`uninja.users.${UserCategory[category]}`, count)
            }
        } catch (error) {
            Sentry.captureException(error);
        }
    }

    private async createTriHourlyTasks(): Promise<void> {
        try {
            await promisify((cb) => this.queue
                .create('reenableFollowers', {})
                .removeOnComplete(true)
                .save(cb))();
        } catch (error) {
            Sentry.captureException(error);
        }
    }
}
