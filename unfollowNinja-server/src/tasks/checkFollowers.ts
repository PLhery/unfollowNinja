import { Job } from 'kue';
import { difference, flatMap } from 'lodash';
import * as Twit from 'twit';
import { promisify } from 'util';
import logger from '../utils/logger';
import { IUnfollowerInfo } from '../utils/types';
import {getTwit, twitterSnowflakeToTime} from '../utils/utils';
import Task from './task';

export default class extends Task {
    public async run(job: Job) {
        const { username, userId } = job.data;

        logger.debug('checking %s s followers', job.data.username);

        const nextCheckTime = parseInt(await this.redis.get(`nextCheckTime:${userId}`), 10) || 0;
        const startedAt = Number(job.started_at);
        if (startedAt < nextCheckTime) {
            logger.debug('checkFollowers @%s - skipping this check.', username);
            return;
        } // don't check every minute if the user has more than 5000 followers : we can only get 5000 followers/minute

        const twit = await getTwit(this.redis, userId);

        let requests = 0;
        let cursor = '-1';
        const followers: string[] = [];
        try {
            let remainingRequests: number;
            let resetTime: number;
            while (cursor !== '0') {
                if (remainingRequests === 0) {
                    // this may happen for ex if someone needs a 2nd requests in the 15th check of the 15minutes window
                    await this.redis.set(`nextCheckTime:${userId}`, resetTime.toString());
                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error('No twitter requests remaining to pursue the job.');
                }
                const result: any = await twit.get('followers/ids', {cursor, stringify_ids: true} as Twit.Params);
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
            await this.redis.set(`nextCheckTime:${userId}`, Math.floor(newNextCheckTime).toString());

            await this.detectUnfollows(job, followers);
        } catch (err) {
            if (!err.twitterReply) {
                throw err;
            } else {
                const unexpected = await this.manageTwitterErrors(err.twitterReply, username, userId);
                if (unexpected) {
                    throw err;
                }
            }
        }
    }

    private async detectUnfollows(job: Job, followers: string[]) {
        const { username, userId } = job.data;

        const formerFollowers: string[] = await this.redis.zrange(`followers:${userId}`, 0, -1);
        const newFollowers = difference(followers, formerFollowers);
        const unfollowers = difference(formerFollowers, followers);

        logger.debug('%s had %d followers and now has %d followers (+%d -%d)',
            username, formerFollowers.length, followers.length, newFollowers.length, unfollowers.length);

        if (newFollowers.length > 0) { // add new followers
            await Promise.all([
                this.redis.zadd(`followers:${userId}`, ...flatMap(newFollowers, followerId => ['0', followerId])),
                this.redis.zadd(`followers:not-cached:${userId}`,
                    ...flatMap(newFollowers, followerId => [job.started_at.toString(), followerId])),
                this.redis.set(`followersList:${userId}`, JSON.stringify(followers)),
            ]); // followersList should be in Twitter's order (useful for cacheFollowers)
        }

        if (unfollowers.length > 0) { // remove unfollowers
            const unfollowersInfo = await Promise.all(
                unfollowers.map(async (unfollowerId): Promise<IUnfollowerInfo> => {
                    const snowflakeId = await this.redis.zscore(`followers:${userId}`, unfollowerId);
                    const followTime = twitterSnowflakeToTime(snowflakeId) ||
                        parseInt(await this.redis.zscore(`followers:not-cached:${userId}`, unfollowerId), 10);

                    return {
                        id: unfollowerId,
                        followTime,
                        unfollowTime: Number(job.started_at),
                    };
                }),
            );

            await Promise.all([
                this.redis.zrem(`followers:${userId}`, ...unfollowersInfo.map(info => info.id)),
                this.redis.zrem(`followers:not-cached:${userId}`, ...unfollowersInfo.map(info => info.id)),
                this.redis.lpush(`unfollowers:${userId}`, ...unfollowersInfo.map(info => JSON.stringify(info))),
                promisify((cb) =>
                    this.queue
                        .create('notifyUser', {
                            title: `Notify @${username} that he's been unfollowed by ` +
                                unfollowersInfo.map((u) => u.id).toString(),
                            userId,
                            username,
                            unfollowersInfo,
                        })
                        .removeOnComplete(true)
                        .save(cb),
                )(),
            ]);
        }
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
