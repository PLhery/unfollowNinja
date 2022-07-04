import { UserCategory } from '../dao/dao';
import Task from './task';
import metrics from '../utils/metrics';

export default class extends Task {
    public async run() {
        for (const [category, count] of Object.entries(await this.dao.getUserCountByCategory())) {
            metrics.gauge(`users.${UserCategory[category]}`, count);
        }
        metrics.gauge(`queue.count.waiting`, await this.queue.getWaitingCount());
        metrics.gauge(`queue.count.active`, await this.queue.getActiveCount());
        metrics.gauge(`queue.count.delayed`, await this.queue.getDelayedCount());
        metrics.gauge(`queue.count.failed`, await this.queue.getFailedCount());
    }
}
