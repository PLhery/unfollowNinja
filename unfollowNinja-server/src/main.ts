import 'dotenv/config';

import * as cluster from 'cluster';
import * as getPort from 'get-port';
import * as Redis from 'ioredis';
import * as kue from 'kue';
import { cpus } from 'os';
import logger from './utils/logger';
import Scheduler from './utils/scheduler';

import tasks from './tasks';
import Task from './tasks/task';

const CLUSTER_SIZE = parseInt(process.env.CLUSTER_SIZE, 10) || cpus().length;
const KUE_APP_PORT = parseInt(process.env.KUE_APP_PORT, 10) || 3000;
const WORKER_RATE_LIMIT = parseInt(process.env.WORKER_RATE_LIMIT, 10) || 25;

if (!process.env.CONSUMER_KEY || !process.env.CONSUMER_SECRET) {
    logger.error('Some required environment variables are missing (CONSUMER_KEY / CONSUMER_SECRET).');
    logger.error('Make sure you added them in a .env file in you cwd or that you defined them.');
    process.exit();
}

const queue = kue.createQueue();
queue.setMaxListeners(200);

queue.on( 'error',  ( err: Error ) => {
    logger.error('Oops... ', err);
});

const redis = new Redis();
if (cluster.isMaster) {
    logger.info('Unfollow ninja - Server');

    if (KUE_APP_PORT > 0) {
        getPort({port: KUE_APP_PORT}).then((port) => {
            kue.app.listen(port, () => {
                logger.info('Launching kue web server on http://localhost:%d', port);
            });
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
        kue.Job.rangeByState( 'delayed', 0, -1, 'asc', (err: Error, jobs: kue.Job[]) => {
            jobs.forEach(job => job.remove());
        });
        kue.Job.rangeByState( 'queued', 0, -1, 'asc', (err: Error, jobs: kue.Job[]) => {
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
    const scheduler = new Scheduler(redis, queue);
    scheduler.start();
} else {
    for (const taskName in tasks) {
        const task: Task = new tasks[taskName](redis, queue);
        queue.process(
            taskName,
            WORKER_RATE_LIMIT,
            (job, done) => task.run(job, done),
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
