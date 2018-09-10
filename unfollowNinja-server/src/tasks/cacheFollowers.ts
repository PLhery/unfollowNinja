import { Job } from 'kue';
import { difference, last } from 'lodash';
import { Twitter } from 'twit';
import logger from '../utils/logger';
import Task from './task';

// get follower's username + profilePic AND use cursors to get their snowflake ID (to have the exact follow date)
export default class extends Task {
    public async run(job: Job) {
        const { username, userId } = job.data;
        const userDao = this.dao.getUserDao(userId);

        const [ cachedFollowers, followers, uncachables] = await Promise.all([
            userDao.getCachedFollowers(),
            userDao.getFollowers(),
            userDao.getUncachableFollowers(),
        ]);

        const cachableFollowers = difference(followers, uncachables);
        const targetId: string = difference(cachableFollowers, cachedFollowers)[0]; // most recent not cached follower

        if (typeof targetId !== 'string') { // no cached follower
            return;
        }

        const targetIndex = cachableFollowers.indexOf(targetId);
        const cursor = (targetIndex > 0) ?
            await userDao.getFollowerSnowflakeId(cachableFollowers[targetIndex - 1]) : '-1';

        if (cursor === '0' || typeof cursor !== 'string') { // there was a problem somewhere...
            throw new Error('An unexpected error happened: no valid cursor found.');
        }

        // optimisation: if we're not at the beginning/end,
        // we can use nextCursor AND previousCursor to get 2 snowflake IDs
        const count = (targetIndex > 0) ? 2 : 1;

        const twit = await userDao.getTwit();

        try {
            const result: any = await twit.get('followers/list', {
                cursor, count, skip_status: true, include_user_entities: false,
            });

            const users: Twitter.User[] = result.data.users;
            const next_cursor_str: string = result.data.next_cursor_str;
            const previous_cursor_str: string = result.data.previous_cursor_str;

            await Promise.all(users.map((user) =>
                this.dao.addTwittoToCache({
                    id: user.id_str,
                    picture: user.profile_image_url_https,
                    username: user.screen_name,
                }, Number(job.started_at)),
            ));

            let targetUpdated = false;
            if (previous_cursor_str !== '0' && users.length > 0) {
                const user = users[0];
                await userDao.setFollowerSnowflakeId(user.id_str, previous_cursor_str.substr(1));
                users.shift();
                targetUpdated = targetUpdated || targetId === user.id_str;
            }
            if (next_cursor_str !== '0' && users.length > 0) {
                const user = last(users);
                await userDao.setFollowerSnowflakeId(user.id_str, next_cursor_str);
                targetUpdated = targetUpdated || targetId === user.id_str;
            }
            if (!targetUpdated) { // some IDs weirdly can't be reached / disabled account?
                // we add them to uncachable set to avoid infinite caching loop
                await userDao.addUncachableFollower(targetId);
            }

            // clean cached followers that are not followers anymore
            const refreshedFollowers = await userDao.getFollowers();
            const uselessCachedFollowers = difference(cachedFollowers, refreshedFollowers);
            if (uselessCachedFollowers.length > 0) {
                userDao.removeFollowerSnowflakeIds(uselessCachedFollowers);
            }
        } catch (err) { // ignore twitter errors, already managed by checkFollowers
            if (!err.twitterReply) {
                throw err;
            } else {
                logger.debug(`No followers cached for @${username}: ${JSON.stringify(err.twitterReply)}`);
                return;
            }
        }

        return;
    }
}
