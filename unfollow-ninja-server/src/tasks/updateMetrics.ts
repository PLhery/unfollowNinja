import type { Job } from 'bull';
import {UserCategory} from '../dao/dao';
import Task from './task';
import metrics from '../utils/metrics';

export default class extends Task {
    public async run(job: Job) {
      for (const [category, count] of Object.entries(await this.dao.getUserCountByCategory())) {
        metrics.gauge(`uninja.users.${UserCategory[category]}`, count)
      }
    }
}
