import {DoneCallback, Job} from "kue";
import * as winston from 'winston';
import * as cluster from 'cluster';

export default function(job: Job,  done: DoneCallback) {
    winston.info('followers checked %s  worker %d', job.data.username, cluster.worker.id);
    done();
}