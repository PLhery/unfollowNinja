import 'dotenv/config';

import * as Sentry from '@sentry/node';
import '@sentry/tracing';
import cluster from 'cluster';
import { cpus } from 'os';
import Bull from 'bull';
import Dao from './dao/dao';
import { checkAllFollowers, checkAllVipFollowers } from './workers/checkAllFollowers';
// import { cacheAllFollowers } from './workers/cacheAllFollowers';
import tasks from './tasks';
import logger from './utils/logger';
import Metrics from './utils/metrics';

// parsing process.env variables
const CLUSTER_SIZE = Number(process.env.CLUSTER_SIZE) || cpus().length;
const WORKER_RATE_LIMIT = Number(process.env.WORKER_RATE_LIMIT) || 15;
const SENTRY_DSN = process.env.SENTRY_DSN || undefined;

if (SENTRY_DSN) {
    Sentry.init({ dsn: SENTRY_DSN, tracesSampleRate: 0.1 });
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

const bullQueue = new Bull('ninja', process.env.REDIS_BULL_URI, {
    defaultJobOptions: {
        attempts: 3,
        backoff: 60000,
        removeOnComplete: true,
        removeOnFail: true,
    },
});
bullQueue.on('error', (err) => {
    logger.error('Bull error: ' + err.stack);
    Sentry.captureException(err);
});

const dao = new Dao();
if (cluster.isMaster) {
    logger.info('Unfollow ninja - Server');
    logger.info('Connecting to the databases..');
    dao.load()
        .then(async () => {
            logger.info('Launching the 2*%s workers...', CLUSTER_SIZE);
            for (let i = 0; i < 2 * CLUSTER_SIZE; i++) {
                cluster.fork();
            }

            // reenable suspended followers every 3h
            await bullQueue.add('reenableFollowers', {}, { repeat: { cron: '0 * * * *' } });

            // update nbUsers metrics every minute
            await bullQueue.add('updateMetrics', {}, { repeat: { cron: '* * * * *' } });
        })
        .catch((error) => {
            logger.error(error.stack);
            Sentry.captureException(error);
        });
} else {
    // if CLUSTER_SIZE=3, we'll create 6 workers
    // workers 1,2,3 will be used to check new unfollowers, workers 4,5,6 to process new bull tasks
    if (cluster.worker.id <= CLUSTER_SIZE) {
        // start checking the worker's followers
        // checkAllFollowers(cluster.worker.id, CLUSTER_SIZE, dao, bullQueue).catch((err) => Sentry.captureException(err));
        checkAllVipFollowers(cluster.worker.id, CLUSTER_SIZE, dao, bullQueue).catch((err) =>
            Sentry.captureException(err)
        );
        // Also start caching its follower's username and follow time
        // cacheAllFollowers(cluster.worker.id, CLUSTER_SIZE, dao).catch((err) => Sentry.captureException(err));
    } else {
        for (const taskName in tasks) {
            const task = new tasks[taskName](dao, bullQueue);
            bullQueue
                .process(taskName, WORKER_RATE_LIMIT, (job) =>
                    task.run(job).catch(async (err) => {
                        const username = job.data.userId
                            ? await dao.getCachedUsername(job.data.userId)
                            : job.data.userId;
                        logger.error(`An error happened with ${taskName} / @${username}: ${err.stack}`);
                        Sentry.withScope((scope) => {
                            scope.setTag('task-name', taskName);
                            scope.setUser({ username });
                            Sentry.captureException(err);
                        });
                        throw err;
                    })
                )
                .catch((err) => Sentry.captureException(err));
        }
    }

    logger.info('Worker %d ready', cluster.worker.id);
}

async function death() {
    process.removeAllListeners(); // be sure death is not called twice (sigterm & sigint)
    logger.info('Queue closing..');
    await bullQueue.close();
    logger.info('Queue closed..');
    dao.disconnect().catch((error) => Sentry.captureException(error));
    Metrics.kill();
    if (cluster.isWorker) {
        process.exit(0);
    }
}
process.once('SIGTERM', death);
process.once('SIGINT', death);
