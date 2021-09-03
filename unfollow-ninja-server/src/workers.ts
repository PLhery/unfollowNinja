import 'dotenv/config';

import Sentry from '@sentry/node';
import cluster from 'cluster';
import kue from 'kue';
import { cpus } from 'os';
import Dao from './dao/dao';
import { checkAllFollowers, checkAllVipFollowers } from './workers/checkAllFollowers';
import { cacheAllFollowers } from './workers/cacheAllFollowers';
import tasks from './tasks';
import type Task from './tasks/task';
import logger from './utils/logger';
import Scheduler from './utils/scheduler';
import Metrics from './utils/metrics';

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

    logger.info('Connecting to the databases..');
    dao.load()
        .then(() => {
            // every 3 minutes, create the checkFollowers tasks for everyone
            scheduler = new Scheduler(dao, queue);
            scheduler.start();

            logger.info('Launching the %s workers...', CLUSTER_SIZE);
            for (let i = 0; i < 2*CLUSTER_SIZE; i++) {
                cluster.fork();
            }
        })
        .catch(error => {
            logger.error(error.stack);
            Sentry.captureException(error)
        });

    // watchdog - recommended by Kue
    queue.watchStuckJobs(1000);
} else {
    // if CLUSTER_SIZE=3, we'll create 6 workers
    // workers 1,2,3 will be used to check new unfollowers, workers 4,5,6 to process new kue tasks
    if (cluster.worker.id <= CLUSTER_SIZE) {
        // start checking the worker's followers
        checkAllFollowers(cluster.worker.id, CLUSTER_SIZE, dao, queue)
            .catch(err => Sentry.captureException(err));
        checkAllVipFollowers(cluster.worker.id, CLUSTER_SIZE, dao, queue)
            .catch(err => Sentry.captureException(err));
        // Also start caching its follower's username and follow time
        cacheAllFollowers(cluster.worker.id, CLUSTER_SIZE, dao)
            .catch(err => Sentry.captureException(err));
    } else {
        for (const taskName in tasks) {
            const task: Task = new tasks[taskName](dao, queue);
            queue.process(
                taskName,
                WORKER_RATE_LIMIT,
                (job: kue.Job, done: kue.DoneCallback) => {
                    task.run(job)
                        .then(() => done())
                        .catch(async (err) => {
                            const username = job.data.userId ? await dao.getCachedUsername(job.data.userId) : null;
                            logger.error(`An error happened with ${taskName} / @${username || ''}: ${err.stack}`);
                            Sentry.withScope(scope => {
                                scope.setTag('task-name', taskName);
                                scope.setUser({ username });
                                Sentry.captureException(err);
                            });
                            done(err);
                        });
                },
            );
        }
    }

    logger.info('Worker %d ready', cluster.worker.id);
}

function death() {
    process.removeAllListeners(); // be sure death is not called twice (sigterm & sigint)
    if (cluster.isMaster) {
        scheduler.stop();
    }
    queue.shutdown( 15000, (err: Error) => {
        logger.info('Kue shutdown - %s', cluster.isMaster ? 'master' : 'worker ' + cluster.worker.id);
        if (err) {
            Sentry.captureException(err);
            logger.error(err.message);
        }
        dao.disconnect().catch(error => Sentry.captureException(error));
        Metrics.kill();
        if (cluster.isWorker) {
            process.exit(0);
        }
    });
}
process.once( 'SIGTERM', death);
process.once( 'SIGINT', death);
