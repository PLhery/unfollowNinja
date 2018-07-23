import {createQueue, DoneCallback, Job} from 'kue';
import logger from '../utils/logger';

const queue = createQueue();

// Every three minutes, create
export default function(job: Job,  done: DoneCallback) {
    logger.info('Generating checkFollowers tasks...');

    // get followers
    for (let i = 0; i < 10; i++) {
        queue.create('checkFollowers', {title: 'Check plhery s followers', username: 'plhery' + i}).save();
    }

    done();
}
