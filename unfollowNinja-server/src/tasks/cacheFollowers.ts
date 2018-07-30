import { Job } from 'kue';
import { intersection, last } from 'lodash';
import * as moment from 'moment';
import { Params, Twitter } from 'twit';
import logger from '../utils/logger';
import { getTwit, twitterSnowflakeToTime } from '../utils/utils';
import Task from './task';

// get follower's username + profilePic AND use cursors to get their snowflake ID (to have the exact follow date)
export default class extends Task {
    public async run(job: Job) {
        const { username, userId } = job.data;

        const shouldBeCached: string[] = await this.redis.zrange(`followers:not-cached:${userId}`, 0, -1);
        const followersList: string[] = JSON.parse(await this.redis.get(`followersList:${userId}`));

        const targetId: string = intersection(followersList, shouldBeCached)[0]; // most recent not cached follower

        if (typeof targetId !== 'string') { // no cached follower
            return;
        }
        logger.debug(`Caching a new follower for @${username}. Target: ${targetId}`);

        const targetIndex = followersList.indexOf(targetId);
        // TODO improve this (Number(bigInt) is not exact)
        const cursor = (targetIndex > 0) ?
            Number(await this.redis.zscore(`followers:${userId}`, followersList[targetIndex - 1])).toString() : '-1';

        if (cursor === '0' || typeof cursor !== 'string') { // there was a problem somewhere...
            throw new Error('An unexpected error happened: no valid cursor found.');
        }

        // optimisation: if we're not at the beginning/end,
        // we can use nextCursor AND previousCursor to get 2 snowflake IDs
        const count = (targetIndex > 0) ? 2 : 1;

        const twit = await getTwit(this.redis, userId);

        try {
            const result: any = await twit.get('followers/list', {
                cursor, count, skip_status: true, include_user_entities: false,
            } as Params);

            const users: Twitter.User[] = result.data.users;
            const next_cursor_str: string = result.data.next_cursor_str;
            const previous_cursor_str: string = result.data.previous_cursor_str;

            if (users.length === 0) {
                // noinspection ExceptionCaughtLocallyJS
                throw new Error('An unexpected error happened: no user could be cached.');
            }
            await Promise.all(users.map((user) => Promise.all([
                this.redis.zadd('cachedTwittos', job.started_at.toString(), user.id_str),
                this.redis.hmset(`cachedTwitto:${user.id_str}`, {
                    picture: user.profile_image_url_https,
                    username: user.screen_name,
                }),
            ])));
            if (previous_cursor_str !== '0') {
                const user = users[0];
                await Promise.all([
                    this.redis.zadd(`followers:${userId}`, previous_cursor_str.substr(1), user.id_str),
                    this.redis.zrem(`followers:not-cached:${userId}`, user.id_str),
                ]);
                const followDate = moment(twitterSnowflakeToTime(previous_cursor_str.substr(1))).calendar();
                logger.debug(`cached ${user.id_str} - @${user.screen_name} (followed ${username} on ${followDate})`);
                users.shift();
            }
            if (next_cursor_str !== '0' && users.length > 0) {
                const user = last(users);
                await Promise.all([
                    this.redis.zadd(`followers:${userId}`, next_cursor_str, user.id_str),
                    this.redis.zrem(`followers:not-cached:${userId}`, user.id_str),
                ]);
                const followDate = moment(twitterSnowflakeToTime(next_cursor_str)).calendar();
                logger.debug(`cached ${user.id_str} - @${user.screen_name} (followed ${username} on ${followDate})`);
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
