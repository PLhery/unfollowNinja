import 'dotenv/config';

import * as Sentry from '@sentry/node';
import * as cluster from 'cluster';
import * as kue from 'kue';
import { cpus } from 'os';
import { promisify } from 'util';
import Dao from './dao/dao';
import tasks from './tasks';
import Task from './tasks/task';
import logger from './utils/logger';
import Scheduler from './utils/scheduler';
import Metrics from './utils/metrics';

// these will be deleted before launching the workers
const CLEAN_TYPES = ['checkFollowers', 'createTwitterTasks', 'getFollowersInfos', 'cacheFollowers'];
const CLEAN_STATES = ['delayed', 'inactive'];

// parsing process.env variables
const CLUSTER_SIZE = Number(process.env.CLUSTER_SIZE) || cpus().length;
const WORKER_RATE_LIMIT = Number(process.env.WORKER_RATE_LIMIT) || 15;
const SENTRY_DSN = process.env.SENTRY_DSN || undefined;

if (SENTRY_DSN) {
    Sentry.init({ dsn: SENTRY_DSN });
}

if (!process.env.CONSUMER_KEY || !process.env.CONSUMER_SECRET) {
    logger.error('Some required environment variables are missing (CONSUMER_KEY / CONSUMER_SECRET).');
    logger.error('Make sure you added them in a .env file in you cwd or that you defined them.');
    process.exit();
}
if (!process.env.DM_CONSUMER_KEY || !process.env.DM_CONSUMER_SECRET) {
    logger.error('Some required environment variables are missing (DM_CONSUMER_KEY / DM_CONSUMER_SECRET).');
    logger.error('Make sure you added them in a .env file in you cwd or that you defined them.');
    process.exit();
}

const queue = kue.createQueue({redis: process.env.REDIS_KUE_URI});
queue.setMaxListeners(200);

queue.on( 'error',  ( err: Error ) => {
    logger.error('Oops... ', err);
});

const dao = new Dao();
let scheduler: Scheduler;
if (cluster.isMaster) {
    logger.info('Unfollow ninja - Server');

    function initFailed( err: Error ) {
        logger.error('Please check that your redis server is launched');
        process.exit(0);
    }
    queue.once( 'error', initFailed);

    queue.client.once('connect', () => {
        queue.removeListener('error', initFailed);
        logger.info('Connected to the kue redis server');
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
    scheduler = new Scheduler(dao, queue);
    scheduler.start();
} else {
    for (const taskName in tasks) {
        const task: Task = new tasks[taskName](dao, queue);
        queue.process(
            taskName,
            WORKER_RATE_LIMIT,
            (job: kue.Job, done: kue.DoneCallback) => {
                task.run(job)
                    .then(() => done())
                    .catch((err) => {
                        logger.error(`An error happened with ${taskName} / @${job.data.username || ''}: ${err.stack}`);
                        Sentry.withScope(scope => {
                            scope.setTag('task-name', taskName);
                            scope.setUser({username: job.data.username});
                            Sentry.captureException(err);
                        });
                        done(err);
                    });
            },
        );
    }

    logger.info('Worker %d ready', cluster.worker.id);
}

function death() {
    process.removeAllListeners(); // be sure death is not called twice (sigterm & sigint)
    if (cluster.isMaster) {
        scheduler.stop();
    }
    queue.shutdown( 9000, (err: Error) => {
        logger.info('Kue shutdown - %s', cluster.isMaster ? 'master' : 'worker ' + cluster.worker.id);
        if (err) {
            Sentry.captureException(err);
            logger.error(err.message);
        }
        dao.disconnect();
        Metrics.kill();
        if (cluster.isWorker) {
            process.exit(0);
        }
    });
}
process.once( 'SIGTERM', death);
process.once( 'SIGINT', death);
