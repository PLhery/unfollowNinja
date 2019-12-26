import {Job} from 'kue';
import {difference} from 'lodash';
import * as Twit from 'twit';
import {promisify} from 'util';
import { UserCategory } from '../dao/dao';
import logger from '../utils/logger';
import metrics from '../utils/metrics';
import {IUnfollowerInfo} from '../utils/types';
import Task from './task';

export default class extends Task {
    public async run(job: Job) {
        const { username, userId } = job.data;
        const userDao = this.dao.getUserDao(userId);
        const startedAt = Number(job.started_at);

        if (job.data.metric) {
            const { name, from } = job.data.metric;
            metrics.gauge(name, startedAt - Number(from));
        }

        if (startedAt < await userDao.getNextCheckTime()) {
            return;
        } // don't check every minute if the user has more than 5000 followers : we can only get 5000 followers/minute

        const twit = await userDao.getTwit();

        let requests = 0;
        let cursor = '-1';
        const followers: string[] = [];
        try {
            let remainingRequests: number;
            let resetTime: number;
            while (cursor !== '0') {
                if (remainingRequests === 0) {
                    // this may happen for ex if someone needs a 2nd requests in the 15th check of the 15minutes window
                    await userDao.setNextCheckTime(resetTime);
                    logger.error('@%s - No twitter requests remaining to pursue the job.', username);
                    return;
                }
                const result: any = await twit.get('followers/ids', {cursor, stringify_ids: true});
                cursor = result.data.next_cursor_str;
                requests++;

                remainingRequests = Number(result.resp.headers['x-rate-limit-remaining']);
                resetTime = Number(result.resp.headers['x-rate-limit-reset']) * 1000;
                // goal: understand "TypeError: Cannot read property 'Symbol(Symbol.iterator)' of followers.push"
                // TODO remove this try-catch
                try {
                    followers.push(...result.data.ids);
                } catch (err) {
                    logger.error('unexpected exception on followers.push');
                    logger.error(JSON.stringify(result));
                    throw err;
                }
            }
            // Compute next time we can do the X requests
            const remainingChecks = Math.floor(remainingRequests / requests);
                // if we have 10 requests left and each check is 4 requests then we have 2 checks left
            if (remainingChecks > 0) {
                await userDao.setNextCheckTime(
                    Math.floor(startedAt + (resetTime - startedAt) / (remainingChecks + 1) - 30000),
                ); // minus 30s because we can trigger it a bit before the ideal time
            } else {
                await userDao.setNextCheckTime(resetTime);
            }

            await this.detectUnfollows(job, followers);
        } catch (err) {
            if (!err.twitterReply) {
                // network error
                if (err.code === 'EAI_AGAIN' || err.code === 'ETIMEDOUT') {
                    logger.warn('@%s - check skipped because of a network error.', username);
                    return;
                }
                throw err;
            } else {
                await this.manageTwitterErrors(err.twitterReply, username, userId);
            }
        }
    }

    private async detectUnfollows(job: Job, followers: string[]) {
        const { username, userId } = job.data;
        const userDao = this.dao.getUserDao(userId);

        let newUser = false;
        let formerFollowers: string[] = await userDao.getFollowers();
        if (formerFollowers === null) {
            newUser = true;
            formerFollowers = [];
        }
        const newFollowers = difference(followers, formerFollowers);
        const unfollowers = difference(formerFollowers, followers);

        if (newFollowers.length > 0 || unfollowers.length > 0) {
            logger.debug('%s had %d followers and now has %d followers (+%d -%d)',
                username, formerFollowers.length, followers.length, newFollowers.length, unfollowers.length);
        }

        if (unfollowers.length > 0) { // remove unfollowers
            const unfollowersInfo = await Promise.all(
                unfollowers.map(async (unfollowerId): Promise<IUnfollowerInfo> => {
                    return {
                        id: unfollowerId,
                        followTime: await userDao.getFollowTime(unfollowerId),
                        unfollowTime: Number(job.started_at),
                        followDetectedTime: await userDao.getFollowDetectedTime(unfollowerId),
                    };
                }),
            );

            await Promise.all([
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
                userDao.updateFollowers(followers, newFollowers, unfollowers, newUser ? 0 : Number(job.started_at)),
            ]);
        } else if (newFollowers.length > 0) {
            await userDao.updateFollowers(followers, newFollowers, unfollowers, newUser ? 0 : Number(job.started_at));
        }
    }

    // Manage or rethrow twitter errors
    private async manageTwitterErrors(
        twitterReply: Twit.Twitter.Errors, username: string, userId: string): Promise<void> {
        const userDao = this.dao.getUserDao(userId);

        for (const { code, message } of (twitterReply.errors)) {
            switch (code) {
                // app-related
                case 32:
                    throw new Error(`[checkFollowers] Authentication problems. Please check that your consumer key.`);
                case 416:
                    throw new Error(`[checkFollowers] Oops, it looks like the application has been suspended :/...`);
                // user-related
                case 89:
                    logger.warn('@%s revoked the token. Removing him from the list...', username);
                    await userDao.setCategory(UserCategory.revoked);
                    break;
                case 326:
                    logger.warn('@%s is suspended. Removing him from the list...', username);
                    await userDao.setCategory(UserCategory.suspended);
                    break;
                case 34: // 404 - the user closed his account?
                    logger.warn('@%s this account doesn\'t exist. Removing him from the list...', username);
                    await userDao.setCategory(UserCategory.accountClosed);
                    break;
                // twitter errors
                case 130: // over capacity
                case 131: // internal error
                    throw new Error(`[checkFollowers] internal Twitter error`);
                case 88: // rate limit
                    throw new Error(`[checkFollowers] the user reached its rate-limit.`);
                default:
                    throw new Error(`[checkFollowers] An unexpected twitter error occured: ${code} ${message}`);
            }
        }
    }
}
