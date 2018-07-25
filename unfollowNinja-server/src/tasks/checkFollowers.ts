import {DoneCallback, Job} from 'kue';
import logger from '../utils/logger';
import Task from './task';

export default class extends Task {
    public run(job: Job,  done: DoneCallback) {
        logger.info('followers checked %s', job.data.username);
        done();
    }
}
