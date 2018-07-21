require('dotenv').config();

import * as winston from 'winston';
import * as kue from 'kue';
import * as cluster from 'cluster';
import { cpus } from 'os';

import tasks, { customRateLimits } from './tasks';

const CLUSTER_SIZE = parseInt(process.env.CLUSTER_SIZE) || cpus().length;
const KUE_APP_PORT = parseInt(process.env.KUE_APP_PORT) || 3000;
const DEFAULT_RATE_LIMIT = parseInt(process.env.DEFAULT_RATE_LIMIT) || 20;

const queue = kue.createQueue();
queue.setMaxListeners(100);

queue.on( 'error', function( err: Error ) {
    winston.error('Oops... ', err);
});

if (cluster.isMaster) {
    winston.info('Unfollow ninja - Server');

    if (KUE_APP_PORT > 0) {
        kue.app.listen(KUE_APP_PORT, () => {
            winston.info('Launching kue web server on port %d', KUE_APP_PORT);
        });
    }

    function initFailed( err: Error ) {
        winston.error('Please check that your redis server is launched');
        process.exit(0);
    }
    queue.once( 'error', initFailed);

    queue.client.once('connect', () => {
        queue.removeListener('error', initFailed);
        winston.info('Connected to the redis server');

        winston.info('Cleaning the previously created delayed jobs');
        kue.Job.rangeByState( 'delayed', 0, 50000, 'asc', function (err: Error, jobs: kue.Job[]) {
            jobs.forEach(job => job.remove());
        });

        winston.info('Launching the %s workers...', CLUSTER_SIZE);
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
    for (let taskName in tasks) {
        queue.process(
            taskName,
            customRateLimits[taskName] || DEFAULT_RATE_LIMIT,
            tasks[taskName]
        );
    }

    winston.info('Worker %d ready', cluster.worker.id);
}

function death() {
    queue.shutdown( 5000, function(err: Error) {
        winston.info('Kue shutdown - %s', cluster.isMaster ? 'master' : 'worker ' + cluster.worker.id);
        if (err) {
            winston.error(err.message);
        }
        process.exit( 0 );
    });
}
process.once( 'SIGTERM', death);
process.once( 'SIGINT', death);