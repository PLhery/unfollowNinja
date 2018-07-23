import {DoneCallback, Job} from "kue";
import logger from '../utils/logger';

export default function(job: Job,  done: DoneCallback) {
    logger.info('followers checked %s', job.data.username);
    done();
}