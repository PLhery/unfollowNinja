import 'dotenv/config';

import * as cluster from 'cluster';
import * as getPort from 'get-port';
import { Server } from 'http';
import * as Redis from 'ioredis';
import * as kue from 'kue';
import { cpus } from 'os';
import { promisify } from 'util';
import logger from './utils/logger';
import Scheduler from './utils/scheduler';

import tasks from './tasks';
import Task from './tasks/task';

// these will be deleted before launching the workers
const CLEAN_TYPES = ['checkFollowers', 'createTwitterTasks', 'getFollowersInfos'];
const CLEAN_STATES = ['delayed', 'inactive'];

// parsing process.env variables
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
let scheduler: Scheduler;
let kueWebServer: Server;
if (cluster.isMaster) {
    logger.info('Unfollow ninja - Server');

    if (KUE_APP_PORT > 0) {
        getPort({port: KUE_APP_PORT}).then((port) => {
            kueWebServer = kue.app.listen(port, () => {
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
    });

    logger.info('Cleaning the previously created delayed jobs');
    Promise.all(CLEAN_TYPES.map((type) => Promise.all(CLEAN_STATES.map((state) =>
            promisify(kue.Job.rangeByType)(type, state, 0, -1, 'asc')
                .then((jobs: kue.Job[]) => Promise.all(
                    jobs.map(job => promisify((cb) => job.remove(cb))()),
                )),
        ),
    )))
        .then(() => {
            logger.info('Launching the %s workers...', CLUSTER_SIZE);
            for (let i = 0; i < CLUSTER_SIZE; i++) {
                cluster.fork();
            }
        });

    // watchdog - recommended by Kue
    queue.watchStuckJobs(1000);

    // every 3 minutes, create the checkFollowers tasks for everyone
    scheduler = new Scheduler(redis, queue);
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
    process.removeAllListeners(); // be sure death is not called twice (sigterm & sigint)
    if (cluster.isMaster) {
        scheduler.stop();
        if (kueWebServer) {
            kueWebServer.close();
        }
    }
    queue.shutdown( 5000, (err: Error) => {
        logger.info('Kue shutdown - %s', cluster.isMaster ? 'master' : 'worker ' + cluster.worker.id);
        if (err) {
            logger.error(err.message);
        }
        redis.disconnect();
        if (cluster.isWorker) {
            process.exit(0);
        }
    });
}
process.once( 'SIGTERM', death);
process.once( 'SIGINT', death);
