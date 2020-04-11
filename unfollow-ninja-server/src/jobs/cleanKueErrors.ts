import * as kue from 'kue';
import logger from '../utils/logger';

kue.createQueue();

kue.Job.rangeByState('failed', 0, 10000, 'asc', (err: Error, jobs: kue.Job[]) => {
    logger.info('removing %d failed jobs...', jobs.length);
    Promise.all(jobs.map(job => job.remove()))
        .then(() => process.exit(0));
});
