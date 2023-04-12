import type { Queue } from 'bull';
import pLimit from 'p-limit';
import * as Sentry from '@sentry/node';

import Dao, { UserCategory } from '../dao/dao';
import logger from '../utils/logger';
import metrics from '../utils/metrics';
import { IUnfollowerInfo } from '../utils/types';
import UserDao from '../dao/userDao';
import { FollowEvent } from '../dao/userEventDao';
import { ApiResponseError, UserV2TimelineResult } from 'twitter-api-v2';

const WORKER_RATE_LIMIT = Number(process.env.WORKER_RATE_LIMIT) || 15;
const VIP_WORKER_RATE_LIMIT = Number(process.env.VIP_WORKER_RATE_LIMIT) || 1;

/**
 * Check 1/nbWorkers users for unfollowers
 * @param workerId a number between 1 and nbWorkers included
 * @param nbWorkers the number of workers
 * @param dao
 * @param queue
 */
/*export async function checkAllFollowers(workerId: number, nbWorkers: number, dao: Dao, queue: Queue) {
    const limit = pLimit(WORKER_RATE_LIMIT);
    const startedAt = Date.now();

    try {
        const promises = (await dao.getUserIdsByCategory(UserCategory.enabled))
            .filter((userId) => hashCode(userId) % nbWorkers === workerId - 1) // we process 1/x users
            .map((userId) => limit(() => checkFollowersWithTimeout(userId, dao, queue)));

        await Promise.all(promises);

        metrics.gauge(`check-duration.worker.${workerId}`, Date.now() - startedAt);
    } catch (error) {
        logger.error(error);
        Sentry.captureException(error);
    }

    // check every minute minimum (Twitter's limit for the followers/ids API requests)
    setTimeout(
        () => checkAllFollowers(workerId, nbWorkers, dao, queue),
        Math.max(0, 15 * 60 * 1000 + startedAt - Date.now())
    );
}*/

export async function checkAllVipFollowers(workerId: number, nbWorkers: number, dao: Dao, queue: Queue) {
    const limit = pLimit(VIP_WORKER_RATE_LIMIT);
    const startedAt = Date.now();

    try {
        const promises = (await dao.getUserIdsByCategory(UserCategory.vip))
            .filter((userId) => hashCode(userId) % nbWorkers === workerId - 1) // we process 1/x users
            .map((userId) => limit(() => checkFollowersWithTimeout(userId, dao, queue)));

        await Promise.all(promises);

        metrics.gauge(`check-vip-duration.worker.${workerId}`, Date.now() - startedAt);
    } catch (error) {
        logger.error(error);
        Sentry.captureException(error);
    }

    // check every minute minimum (Twitter's limit for the followers/ids API requests)
    setTimeout(
        () => checkAllVipFollowers(workerId, nbWorkers, dao, queue),
        Math.max(0, 15 * 60 * 1000 + startedAt - Date.now())
    );
}

// inspired from https://gist.github.com/hyamamoto/fd435505d29ebfa3d9716fd2be8d42f0 / abs(java's string.hashcode)
function hashCode(s: string) {
    let h = 0;
    for (let i = 0; i < s.length; i++)
        // tslint:disable-next-line:no-bitwise
        h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

/**
 * Check Followers, making sure errors are logged into sentry and with a 2min timeout
 * @param userId the ID of the user we want to check followers from
 * @param dao the global dao object
 * @param queue the global queue object
 */
async function checkFollowersWithTimeout(userId: string, dao: Dao, queue: Queue) {
    try {
        let watchdogTimeout;
        await Promise.race([
            checkFollowers(userId, dao, queue),
            new Promise(
                (_, reject) =>
                    (watchdogTimeout = setTimeout(
                        () => reject(new Error('Timeout - checkFollowers took more than 10mins')),
                        10 * 60 * 1000
                    ))
            ),
        ]);
        clearTimeout(watchdogTimeout);
    } catch (error) {
        const username: string = (await dao.getCachedUsername(userId).catch(() => userId)) || userId;
        logger.error(`An error happened with checkFollowers / @${username}: ${error.stack}`);
        Sentry.withScope((scope) => {
            scope.setTag('task-name', 'checkFollowers');
            scope.setUser({ username });
            Sentry.captureException(error);
        });
    }
}

async function checkFollowers(userId: string, dao: Dao, queue: Queue) {
    const userDao = dao.getUserDao(userId);

    if (Date.now() < (await userDao.getNextCheckTime())) {
        return;
    } // don't check every minute if the user has more than 5000 followers : we can only get 5000 followers/minute

    const twitterApi = await userDao.getTwitterApi();

    let requests = 0;
    let cursor = null;
    let followers: string[] = [];

    // For big account (>150k), maybe we got the 150k first accounts previously, we'll continue the scrapping
    const scrappedFollowers = await userDao.getTemporaryFollowerList();
    if (scrappedFollowers) {
        followers = scrappedFollowers.followers;
        cursor = scrappedFollowers.nextCursor;
    }
    try {
        while (cursor !== '0') {
            const result = await twitterApi.v2.get<UserV2TimelineResult>(
                'users/:id/followers',
                { max_results: 1000, ...(cursor ? { pagination_token: cursor } : null) },
                { fullResponse: true, params: { id: userId } }
            );
            // TODO manage errors
            /*        if (!result.data.data && result.data.errors === 503) {
                // noinspection ExceptionCaughtLocallyJS
                throw new Error('[checkFollowers] Twitter services overloaded / unavailable (503)');
            }*/
            cursor = result.data.meta?.next_token || '0';
            requests++;

            followers.push(...result.data.data.map((user) => user.id));
        }
        if (scrappedFollowers) {
            await userDao.deleteTemporaryFollowerList();
        }
        // Compute next time we can do the X requests

        if (requests > 1) {
            // if we needed more than 1 request
            await userDao.setNextCheckTime(
                // next check time is in 14min * nb request
                Math.floor(Date.now() + 14.4 * 60 * 1000 * requests)
            ); // minus 30s because we can trigger it a bit before the ideal time
        }

        await detectUnfollows(userId, followers, dao, queue);
    } catch (err) {
        if (!(err instanceof ApiResponseError)) {
            // network error
            if (err.code === 'EAI_AGAIN' || err.code === 'ETIMEDOUT') {
                logger.warn('check skipped because of a network error.');
                return;
            }
            throw err;
        } else {
            if (err.code === 429) {
                // too many requests - rate limit
                if (followers.length > 0) {
                    await userDao.setTemporaryFollowerList(cursor, followers);
                }
                if (requests > 1) {
                    // if we needed more than 1 request
                    await userDao.setNextCheckTime(
                        // next check time is in 14min * nb request
                        Math.floor(Date.now() + 14.4 * 60 * 1000 * requests)
                    ); // minus 30s because we can trigger it a bit before the ideal time
                }
                throw new Error('[checkFollowers] Error 429 Too many requests');
            }
            await manageTwitterErrors(err, userDao);
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

    const followersSet = new Set(followers);
    const formerFollowersSet = new Set(formerFollowers);

    const newFollowers = followers.filter((value) => !formerFollowersSet.has(value));
    const unfollowers = formerFollowers.filter((value) => !followersSet.has(value));

    const limit = pLimit(5); // make no more than 5 userDao calls at a time

    if (!newUser) {
        await Promise.all(
            newFollowers.map((fid) =>
                limit(() => dao.userEventDao.logFollowEvent(userId, FollowEvent.followDetected, fid, followers.length))
            )
        );
        await Promise.all(
            unfollowers.map((fid) =>
                limit(() =>
                    dao.userEventDao.logFollowEvent(userId, FollowEvent.unfollowDetected, fid, followers.length)
                )
            )
        );
    } else {
        await dao.userEventDao.logFollowEvent(
            userId,
            FollowEvent.accountCreatedAndFollowersLoaded,
            '',
            followers.length
        );
    }

    if (unfollowers.length > 0) {
        const limit = pLimit(5); // make no more than 5 userDao calls at a time

        // remove unfollowers
        const unfollowersInfo = await Promise.all(
            unfollowers.map(async (unfollowerId): Promise<IUnfollowerInfo> => {
                return limit(async () => {
                    return {
                        id: unfollowerId,
                        followTime: await userDao.getFollowTime(unfollowerId),
                        unfollowTime: Date.now(),
                        followDetectedTime: await userDao.getFollowDetectedTime(unfollowerId),
                    };
                });
            })
        );

        await queue.add('notifyUser', {
            userId,
            unfollowersInfo,
        });
        await userDao.updateFollowers(followers, newFollowers, unfollowers, newUser ? 0 : Date.now());
    } else if (newFollowers.length > 0) {
        await userDao.updateFollowers(followers, newFollowers, unfollowers, newUser ? 0 : Date.now());
    }
}

// Manage or rethrow twitter errors
async function manageTwitterErrors(err: ApiResponseError, userDao: UserDao): Promise<void> {
    for (const { code, message } of [err]) {
        switch (code) {
            // app-related
            case 32:
                throw new Error(`[checkFollowers] Authentication problems. Please check that your consumer key.`);
            case 416:
                throw new Error(`[checkFollowers] Oops, it looks like the application has been suspended :/...`);
            // user-related
            case 89:
            case 401: // since V2? but not clear message
                logger.warn('@%s revoked the token. Removing them from the list...', await userDao.getUsername());
                await userDao.setCategory(UserCategory.revoked);
                break;
            case 326:
            case 403: // since V2? but not clear message
                logger.warn('@%s is suspended. Removing them from the list...', await userDao.getUsername());
                await userDao.setCategory(UserCategory.suspended);
                break;
            case 34: // 404 - the user closed his account?
                logger.warn(
                    "@%s this account doesn't exist. Removing them from the list...",
                    await userDao.getUsername()
                );
                await userDao.setCategory(UserCategory.accountClosed);
                break;
            // twitter errors
            case 130: // over capacity
            case 131: // internal error
                throw new Error(`[checkFollowers] internal Twitter error`);
            case 88: // rate limit
                throw new Error(`[checkFollowers] the user reached its rate-limit.`);
            default:
                throw new Error(
                    `[checkFollowers] An unexpected twitter error occured: ${code} ${message} ${err.data.title} ${err.data.detail}`
                );
        }
    }
}
