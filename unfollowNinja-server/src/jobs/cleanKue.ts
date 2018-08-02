import * as kue from 'kue';
import logger from '../utils/logger';

kue.createQueue();

kue.Job.range(0, -1, 'asc', (err: Error, jobs: kue.Job[]) => {
    logger.info('removing %d jobs...', jobs.length);
    Promise.all(jobs.map(job => job.remove()))
        .then(() => process.exit(0));
});
