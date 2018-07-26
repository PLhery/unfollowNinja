import { DoneCallback, Job } from 'kue';
import * as Twit from 'twit';
import logger from '../utils/logger';
import Task from './task';

export default class extends Task {
    public async run(job: Job,  done: DoneCallback) {
        const { username, userId } = job.data;
        const { token, tokenSecret } = await this.redis.hgetall(`user:${userId}`);

        logger.info('checking %s s followers', job.data.username);

        const nextCheckTime = parseInt(await this.redis.get(`nextCheckTime:${userId}`), 10) || 0;
        const startedAt = Number(job.started_at);
        if (startedAt < nextCheckTime) {
            logger.info('checkFollowers @%s - skipping this check.', username);
            return done();
        } // don't check every minute if the user has more than 5000 followers : we can only get 5000 followers/minute

        const twit = new Twit({
            access_token:         token,
            access_token_secret:  tokenSecret,
            consumer_key:         process.env.CONSUMER_KEY,
            consumer_secret:      process.env.CONSUMER_SECRET,
        });

        let requests = 0;
        let cursor = '-1';
        const followers: string[] = [];
        try {
            let remainingRequests: number;
            let resetTime: number;
            while (cursor !== '0') {
                if (remainingRequests === 0) {
                    logger.error('checkFollowers @%s - No twitter requests remaining to pursue the job.', username);
                    // this may happen for ex if someone needs a 2nd requests in the 15th check of the 15minutes window
                    return done(new Error('No twitter requests remaining to pursue the job.'));
                }
                // @ts-ignore
                const result = await twit.get('followers/ids', {cursor, stringify_ids: true});
                cursor = result.data.next_cursor_str;
                requests++;

                remainingRequests = parseInt(result.resp.headers['x-rate-limit-remaining'], 10);
                resetTime = parseInt(result.resp.headers['x-rate-limit-reset'], 10) * 1000;
                followers.push(...result.data.ids);
            }
            // Compute next time we can do the X requests
            const remainingChecks = Math.floor(remainingRequests / requests);
                // if we have 10 requests left and each check is 4 requests then we have 2 checks left
            let newNextCheckTime = resetTime;
            if (remainingChecks > 0) {
                newNextCheckTime = startedAt + (resetTime - startedAt) / (remainingChecks + 1) - 30000;
                // minus 30s because we can trigger it a bit before the ideal time
            }
            await this.redis.set(`nextCheckTime:${userId}`, newNextCheckTime.toString());
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
