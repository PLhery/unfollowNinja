import logger from '../utils/logger';
import Bull from 'bull';
import * as Sentry from '@sentry/node';

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

// remove failed and completed jobs from the queue (not supposed to be there anyway)
async function runJob() {
    console.log('completed: ', await bullQueue.getCompletedCount());
    await bullQueue.clean(0, 'completed');

    console.log('failed: ', await bullQueue.getCompletedCount());
    await bullQueue.clean(0, 'failed');

    await bullQueue.close();
}

runJob().catch(console.error);
