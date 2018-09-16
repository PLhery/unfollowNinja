import {Job} from 'kue';
import {difference} from 'lodash';
import * as Twit from 'twit';
import {promisify} from 'util';
import { UserCategory } from '../dao/dao';
import logger from '../utils/logger';
import {IUnfollowerInfo} from '../utils/types';
import Task from './task';

export default class extends Task {
    public async run(job: Job) {
        const { username, userId } = job.data;
        const userDao = this.dao.getUserDao(userId);
        const startedAt = Number(job.started_at);

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
                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error('No twitter requests remaining to pursue the job.');
                }
                const result: any = await twit.get('followers/ids', {cursor, stringify_ids: true});
                cursor = result.data.next_cursor_str;
                requests++;

                remainingRequests = Number(result.resp.headers['x-rate-limit-remaining']);
                resetTime = Number(result.resp.headers['x-rate-limit-reset']) * 1000;
                followers.push(...result.data.ids);
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

    // return true if the error is really unexpected / the job will be kept in the "failed" section
    private async manageTwitterErrors(
        twitterReply: Twit.Twitter.Errors, username: string, userId: string): Promise<boolean> {
        const userDao = this.dao.getUserDao(userId);

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
                    await userDao.setCategory(UserCategory.revoked);
                    break;
                case 326:
                    logger.warn('@%s is suspended. removing him from the list...', username);
                    await userDao.setCategory(UserCategory.suspended);
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
