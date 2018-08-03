import { Job } from 'kue';
import { difference, last } from 'lodash';
import * as moment from 'moment';
import { Params, Twitter } from 'twit';
import logger from '../utils/logger';
import { twitterCursorToTime } from '../utils/utils';
import Task from './task';

// get follower's username + profilePic AND use cursors to get their snowflake ID (to have the exact follow date)
export default class extends Task {
    public async run(job: Job) {
        const { username, userId } = job.data;
        const userDao = this.dao.getUserDao(userId);

        const [ cachedFollowers, followers] = await Promise.all([
            userDao.getCachedFollowers(),
            userDao.getFollowers(),
        ]);

        const targetId: string = difference(followers, cachedFollowers)[0]; // most recent not cached follower

        if (typeof targetId !== 'string') { // no cached follower
            return;
        }

        const targetIndex = followers.indexOf(targetId);
        const cursor = (targetIndex > 0) ?
            await userDao.getFollowerSnowflakeId(followers[targetIndex - 1]) : '-1';

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

            if (users.length === 0) {
                return;
            }
            await Promise.all(users.map((user) =>
                this.dao.addTwittoToCache({
                    id: user.id_str,
                    picture: user.profile_image_url_https,
                    username: user.screen_name,
                }, Number(job.started_at)),
            ));
            if (previous_cursor_str !== '0') {
                const user = users[0];
                await userDao.setFollowerSnowflakeId(user.id_str, previous_cursor_str.substr(1));
                users.shift();
            }
            if (next_cursor_str !== '0' && users.length > 0) {
                const user = last(users);
                await userDao.setFollowerSnowflakeId(user.id_str, next_cursor_str);
                const followDate = moment(twitterCursorToTime(next_cursor_str)).calendar();
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
