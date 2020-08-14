import type { Job, Queue } from 'kue';
import pLimit from 'p-limit';
import * as Sentry from '@sentry/node';
import { difference } from 'lodash';
import { promisify } from 'util';
import * as Twit from 'twit';

import Dao, { UserCategory } from '../dao/dao';
import logger from '../utils/logger';
import metrics from '../utils/metrics';
import {IUnfollowerInfo} from '../utils/types';
import UserDao from '../dao/userDao';

const WORKER_RATE_LIMIT = Number(process.env.WORKER_RATE_LIMIT) || 15;

/**
 * Check 1/nbWorkers users for unfollowers
 * @param workerId a number between 1 and nbWorkers included
 * @param nbWorkers the number of workers
 * @param dao
 * @param queue
 */
export async function checkAllFollowers(workerId: number, nbWorkers: number, dao: Dao, queue: Queue) {
    const limit = pLimit(WORKER_RATE_LIMIT);
    const startedAt = Date.now();

    const promises = (await dao.getUserIdsByCategory(UserCategory.enabled))
        .filter(userId => hashCode(userId) % nbWorkers === workerId - 1) // we process 1/x users
        .map((userId) => limit(async () => {
            try {
                await checkFollowers(userId, dao, queue);
            } catch (error) {
                const username: string = (await dao.getCachedUsername(userId)) || userId;
                logger.error(`An error happened with checkFollowers / @${username}: ${error.stack}`);
                Sentry.withScope(scope => {
                    scope.setTag('task-name', 'checkFollowers');
                    scope.setUser({username});
                    Sentry.captureException(error);
                });
            }
        }));

    await Promise.all(promises);
    const checkDuration =  Date.now() - startedAt;
    metrics.gauge(`uninja.check-duration.worker.${workerId}`, checkDuration);

    // check every minute minimum (Twitter's limit for the followers/ids API requests)
    setTimeout(
        () => checkAllFollowers(workerId, nbWorkers, dao, queue),
        Math.max(0, 60*1000 - checkDuration)
    );
}

export async function checkAllVipFollowers(workerId: number, nbWorkers: number, dao: Dao, queue: Queue) {
    const startedAt = Date.now();

    const userIds = (await dao.getUserIdsByCategory(UserCategory.vip))
        .filter(userId => hashCode(userId) % nbWorkers === workerId - 1) // we process 1/x users

    for (const userId of userIds) {
        try {
            await checkFollowers(userId, dao, queue);
        } catch (error) {
            const username: string = (await dao.getCachedUsername(userId)) || userId;
            logger.error(`An error happened with checkFollowers / @${username}: ${error.stack}`);
            Sentry.withScope(scope => {
                scope.setTag('task-name', 'checkFollowers');
                scope.setUser({username});
                Sentry.captureException(error);
            });
        }
    }

    const checkDuration =  Date.now() - startedAt;
    metrics.gauge(`uninja.check-vip-duration.worker.${workerId}`, checkDuration);

    // check every minute minimum (Twitter's limit for the followers/ids API requests)
    setTimeout(
        () => checkAllVipFollowers(workerId, nbWorkers, dao, queue),
        Math.max(0, 60*1000 - checkDuration)
    );
}

// inspired from https://gist.github.com/hyamamoto/fd435505d29ebfa3d9716fd2be8d42f0 / abs(java's string.hashcode)
function hashCode(s: string) {
    let h = 0;
    for(let i = 0; i < s.length; i++)
        // tslint:disable-next-line:no-bitwise
        h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    return Math.abs(h);
}

async function checkFollowers(userId: string, dao: Dao, queue: Queue) {
    const userDao = dao.getUserDao(userId);

    if (Date.now() < await userDao.getNextCheckTime()) {
        return;
    } // don't check every minute if the user has more than 5000 followers : we can only get 5000 followers/minute

    let twit = await userDao.getTwit();
    let useDmTwit = false;
    let twitResetTime = 0;

    let requests = 0;
    let cursor = '-1';
    const followers: string[] = [];
    try {
        let remainingRequests: number;
        let resetTime: number;
        while (cursor !== '0') {
            if (remainingRequests === 0) {
                if (useDmTwit) {
                    // this may happen for 150 000+ followers
                    await userDao.setNextCheckTime(Math.max(resetTime, twitResetTime));
                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error('No twitter requests remaining to pursue the job.');
                } else {
                    // this may happen for 75 000+ followers
                    useDmTwit = true;
                    twitResetTime = resetTime;
                    twit = await userDao.getDmTwit();
                }
            }
            const result: any = await twit.get('followers/ids', {cursor, stringify_ids: true, user_id: userId});
            if (!result.data && result.resp.statusCode === 503) {
                // noinspection ExceptionCaughtLocallyJS
                throw new Error('[checkFollowers] Twitter services overloaded / unavailable (503)');
            }
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
                Math.floor(Date.now() + (resetTime - Date.now()) / (remainingChecks + 1) - 30000),
            ); // minus 30s because we can trigger it a bit before the ideal time
        } else {
            await userDao.setNextCheckTime(resetTime);
        }

        await detectUnfollows(userId, followers, dao, queue);
    } catch (err) {
        if (!err.twitterReply) {
            // network error
            if (err.code === 'EAI_AGAIN' || err.code === 'ETIMEDOUT') {
                logger.warn('check skipped because of a network error.');
                return;
            }
            throw err;
        } else {
            await manageTwitterErrors(err.twitterReply, userDao);
        }
    }
}

async function detectUnfollows(userId: string, followers: string[], dao: Dao, queue: Queue) {
    const userDao = dao.getUserDao(userId);

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
            await userDao.getUsername(), formerFollowers.length, followers.length, newFollowers.length, unfollowers.length);
    }

    if (unfollowers.length > 0) { // remove unfollowers
        const unfollowersInfo = await Promise.all(
            unfollowers.map(async (unfollowerId): Promise<IUnfollowerInfo> => {
                return {
                    id: unfollowerId,
                    followTime: await userDao.getFollowTime(unfollowerId),
                    unfollowTime: Date.now(),
                    followDetectedTime: await userDao.getFollowDetectedTime(unfollowerId),
                };
            }),
        );

        await promisify((cb) =>
                queue
                    .create('notifyUser', {
                        userId,
                        unfollowersInfo,
                    })
                    .removeOnComplete(true)
                    .attempts(5)
                    .backoff( {delay: 60000, type: 'exponential'})
                    .save(cb),
            )(),
        await userDao.updateFollowers(followers, newFollowers, unfollowers, newUser ? 0 : Date.now())
    } else if (newFollowers.length > 0) {
        await userDao.updateFollowers(followers, newFollowers, unfollowers, newUser ? 0 : Date.now());
    }
}

// Manage or rethrow twitter errors
async function manageTwitterErrors(twitterReply: Twit.Twitter.Errors, userDao: UserDao): Promise<void> {
    for (const { code, message } of (twitterReply.errors)) {
        switch (code) {
            // app-related
            case 32:
                throw new Error(`[checkFollowers] Authentication problems. Please check that your consumer key.`);
            case 416:
                throw new Error(`[checkFollowers] Oops, it looks like the application has been suspended :/...`);
            // user-related
            case 89:
                logger.warn('@%s revoked the token. Removing them from the list...', await userDao.getUsername());
                await userDao.setCategory(UserCategory.revoked);
                break;
            case 326:
                logger.warn('@%s is suspended. Removing them from the list...', await userDao.getUsername());
                await userDao.setCategory(UserCategory.suspended);
                break;
            case 34: // 404 - the user closed his account?
                logger.warn('@%s this account doesn\'t exist. Removing them from the list...', await userDao.getUsername());
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