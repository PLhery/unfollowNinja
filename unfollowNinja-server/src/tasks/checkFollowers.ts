import { DoneCallback, Job } from 'kue';
import * as Twit from 'twit';
import logger from '../utils/logger';
import Task from './task';

export default class extends Task {
    public async run(job: Job,  done: DoneCallback) {
        const { username, userId } = job.data;
        const { token, tokenSecret } = await this.redis.hgetall(`user:${userId}`);

        logger.info('checking %s s followers', job.data.username);

        const twit = new Twit({
            access_token:         token,
            access_token_secret:  tokenSecret,
            consumer_key:         process.env.CONSUMER_KEY,
            consumer_secret:      process.env.CONSUMER_SECRET,
        });

        try {
            // @ts-ignore
            const i = await twit.get('followers/ids', {stringify_ids: true});
        } catch (err) {
            if (!err.twitterReply) {
                logger.error(err);
                return done(err);
            } else {
                return this.manageTwitterErrors(err.twitterReply, username, userId)
                    .then((unexpected) => unexpected ? done(err) : done());
            }
        }
        done();
    }

    // return true if the error is really unexpected / the job will be kept in the "failed" section
    private async manageTwitterErrors(
        twitterReply: Twit.Twitter.Errors, username: string, userId: string): Promise<boolean> {

        for (const { code, message } of twitterReply.errors) {
            switch (code) {
                // app-related
                case 32:
                    logger.error('Authentication problem with @%s. ' +
                        'Please check that your consumer key & secret are correct.', username);
                    return true;
                case 416:
                    logger.error('Oops, it looks like the application has been suspended :/...');
                    return true;
                // user-related
                case 89:
                    logger.warn('@%s revoked the token. removing him from the list...', username);
                    await Promise.all([
                    this.redis.zrem('users:enabled', userId),
                    this.redis.zadd('users:revoked', Date.now().toString(), userId),
                ]);
                    break;
                case 326:
                    logger.warn('@%s is suspended. removing him from the list...', username);
                    await Promise.all([
                    this.redis.zrem('users:enabled', userId),
                    this.redis.zadd('users:suspended', Date.now().toString(), userId),
                ]);
                    break;
                // twitter errors
                case 130: // over capacity
                case 131: // internal error
                    logger.warn('Twitter has problems at the moment, skipping this check');
                    return true;
                case 88: // rate limit
                    logger.warn('@%s reached its rate-limit.', username);
                    return true;
                default:
                    logger.error('An unexpected twitter error occured with @%s: %d %s',
                        username, code, message);
                    return true;
            }
        }
        return false;
    }
}
