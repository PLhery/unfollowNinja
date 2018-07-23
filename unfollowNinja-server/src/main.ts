import 'dotenv/config';

import * as cluster from 'cluster';
import * as kue from 'kue';
import { cpus } from 'os';
import logger from './utils/logger';

import tasks, { customRateLimits } from './tasks';

const CLUSTER_SIZE = parseInt(process.env.CLUSTER_SIZE, 10) || cpus().length;
const KUE_APP_PORT = parseInt(process.env.KUE_APP_PORT, 10) || 3000;
const DEFAULT_RATE_LIMIT = parseInt(process.env.DEFAULT_RATE_LIMIT, 10) || 20;

const queue = kue.createQueue();
queue.setMaxListeners(100);

queue.on( 'error',  ( err: Error ) => {
    logger.error('Oops... ', err);
});

if (cluster.isMaster) {
    logger.info('Unfollow ninja - Server');

    if (KUE_APP_PORT > 0) {
        kue.app.listen(KUE_APP_PORT, () => {
            logger.info('Launching kue web server on port %d', KUE_APP_PORT);
        });
    }

    function initFailed( err: Error ) {
        logger.error('Please check that your redis server is launched');
        process.exit(0);
    }
    queue.once( 'error', initFailed);

    queue.client.once('connect', () => {
        queue.removeListener('error', initFailed);
        logger.info('Connected to the redis server');

        logger.info('Cleaning the previously created delayed jobs');
        kue.Job.rangeByState( 'delayed', 0, 50000, 'asc', (err: Error, jobs: kue.Job[]) => {
            jobs.forEach(job => job.remove());
        });

        logger.info('Launching the %s workers...', CLUSTER_SIZE);
        for (let i = 0; i < CLUSTER_SIZE; i++) {
            cluster.fork();
        }
    });

    // watchdog - recommended by Kue
    queue.watchStuckJobs(1000);

    // every 3 minutes, create the checkFollowers tasks for everyone
    setInterval(() => queue.create('createTwitterTasks', {}).save(), 3 * 60 * 1000);
    queue.create('createTwitterTasks', {}).removeOnComplete(true).save();
} else {
    for (const taskName in tasks) {
        queue.process(
            taskName,
            customRateLimits[taskName] || DEFAULT_RATE_LIMIT,
            tasks[taskName],
        );
    }

    logger.info('Worker %d ready', cluster.worker.id);
}

function death() {
    queue.shutdown( 5000, (err: Error) => {
        logger.info('Kue shutdown - %s', cluster.isMaster ? 'master' : 'worker ' + cluster.worker.id);
        if (err) {
            logger.error(err.message);
        }
        process.exit( 0 );
    });
}
process.once( 'SIGTERM', death);
process.once( 'SIGINT', death);
