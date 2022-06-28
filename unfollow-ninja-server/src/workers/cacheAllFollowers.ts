import pLimit from 'p-limit';
import * as Sentry from '@sentry/node';
import { difference } from 'lodash';
import { Twitter } from 'twit';

import Dao, { UserCategory } from '../dao/dao';
import logger from '../utils/logger';
import metrics from '../utils/metrics';

const WORKER_RATE_LIMIT = Number(process.env.WORKER_RATE_LIMIT) || 15;

/**
 * Check 1/nbWorkers users for uncached follower's username and follow date
 * @param workerId a number between 1 and nbWorkers included
 * @param nbWorkers the number of workers
 * @param dao
 */
export async function cacheAllFollowers(workerId: number, nbWorkers: number, dao: Dao) {
    const limit = pLimit(WORKER_RATE_LIMIT);
    const startedAt = Date.now();

    try {
        const promises = (await dao.getUserIdsByCategory(UserCategory.enabled))
            .concat(await dao.getUserIdsByCategory(UserCategory.vip))
            .filter((userId) => hashCode(userId) % nbWorkers === workerId - 1) // we process 1/x users
            .map((userId) =>
                limit(async () => {
                    const username: string = (await dao.getCachedUsername(userId)) || userId;
                    try {
                        if (await dao.getUserDao(userId).getHasNotCachedFollowers()) {
                            await cacheFollowers(userId, dao);
                        }
                    } catch (error) {
                        logger.error(`An error happened with checkFollowers / @${username}: ${error.stack}`);
                        Sentry.withScope((scope) => {
                            scope.setTag('task-name', 'cacheFollowers');
                            scope.setUser({ username });
                            Sentry.captureException(error);
                        });
                    }
                })
            );

        await Promise.all(promises);
        metrics.gauge(`cache-duration.worker.${workerId}`, Date.now() - startedAt);
    } catch (error) {
        try {
            Sentry.captureException(error);
        } catch (sentryError) {
            logger.error(sentryError);
        }
        logger.error(error);
    }

    // check every minute minimum (Twitter's limit for the followers/list API requests)
    setTimeout(() => cacheAllFollowers(workerId, nbWorkers, dao), Math.max(0, 60 * 1000 + startedAt - Date.now()));
}

// inspired from https://gist.github.com/hyamamoto/fd435505d29ebfa3d9716fd2be8d42f0 / abs(java's string.hashcode)
function hashCode(s: string) {
    let h = 0;
    for (let i = 0; i < s.length; i++)
        // tslint:disable-next-line:no-bitwise
        h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

async function cacheFollowers(userId: string, dao: Dao) {
    const userDao = dao.getUserDao(userId);

    const [cachedFollowers, followers, uncachables] = await Promise.all([
        userDao.getCachedFollowers(),
        userDao.getFollowers(),
        userDao.getUncachableFollowers(),
    ]);

    const cachableFollowers = difference(followers, uncachables);
    const targetId: string = difference(cachableFollowers, cachedFollowers)[0]; // most recent not cached follower

    if (typeof targetId !== 'string') {
        // no cached follower
        return;
    }

    const targetIndex = cachableFollowers.indexOf(targetId);
    const cursor = targetIndex > 0 ? await userDao.getFollowerSnowflakeId(cachableFollowers[targetIndex - 1]) : '-1';

    if (cursor === '0' || typeof cursor !== 'string') {
        // there was a problem somewhere...
        throw new Error('An unexpected error happened: no valid cursor found.');
    }

    // optimisation: if we're not at the beginning/end,
    // we can use nextCursor AND previousCursor to get 2 snowflake IDs
    const count = targetIndex > 0 ? 2 : 1;

    const twit = await userDao.getTwit();

    try {
        const result = await twit.get('followers/list', {
            cursor,
            count,
            skip_status: true,
            include_user_entities: false,
        });
        if (!result.data && result.resp.statusCode === 503) {
            // noinspection ExceptionCaughtLocallyJS
            throw new Error('[cacheFollowers] Twitter services overloaded / unavailable (503)');
        }

        const users: Twitter.User[] = result.data['users'];
        const next_cursor_str: string = result.data['next_cursor_str'];
        const previous_cursor_str: string = result.data['previous_cursor_str'];

        await Promise.all(
            users.map((user) =>
                dao.addTwittoToCache({
                    id: user.id_str,
                    username: user.screen_name,
                })
            )
        );

        let targetUpdated = false;
        if (previous_cursor_str !== '0' && users.length > 0) {
            const user = users[0];
            await userDao.setFollowerSnowflakeId(user.id_str, previous_cursor_str.substr(1));
            users.shift();
            targetUpdated = targetUpdated || targetId === user.id_str;
        }
        if (next_cursor_str !== '0' && users.length > 0) {
            const user = users[users.length - 1];
            await userDao.setFollowerSnowflakeId(user.id_str, next_cursor_str);
            targetUpdated = targetUpdated || targetId === user.id_str;
        }
        if (!targetUpdated) {
            // some IDs weirdly can't be reached / disabled account?
            // we add them to uncachable set to avoid infinite caching loop
            await userDao.addUncachableFollower(targetId);
        }

        // clean cached followers that are not followers anymore
        const refreshedFollowers = await userDao.getFollowers();
        const uselessCachedFollowers = difference(cachedFollowers, refreshedFollowers);
        if (uselessCachedFollowers.length > 0) {
            await userDao.removeFollowerSnowflakeIds(uselessCachedFollowers);
        }
    } catch (err) {
        // ignore twitter errors, already managed by checkFollowers
        if (!err.twitterReply) {
            throw err;
        } else {
            // twitter errors (account disabled...)
            return;
        }
    }

    return;
}
