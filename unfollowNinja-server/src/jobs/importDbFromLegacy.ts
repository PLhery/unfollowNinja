// This job parses db export and import it in redis.
// It will be useful to - benchmark against the legacy backend & migrate from the legacy backend
import 'dotenv/config';

import * as es from 'event-stream';
import * as fs from 'fs';
import * as Redis from 'ioredis';
import * as JSONStream from 'jsonstream';
import { defer, uniqBy } from 'lodash';

import logger from '../utils/logger';

const LEGACY_JSON_FILE_PATH = process.env.JOBS_LEGACY_JSON_FILE || '';

const redis = new Redis();

let i = 0;
let unfollowers = 0;
let followers = 0;
fs.createReadStream(LEGACY_JSON_FILE_PATH)
    .pipe(JSONStream.parse('*'))
    .pipe(es.mapSync(async (data: any) => {
        if (data.twitter) {
            const { username, id, token, secret, photo } = data.twitter;
            const timestamp = parseInt(data._id.$oid.substr(0, 8), 16) * 1000;

            logger.info('parsing - user n %d : @%s', ++i, username);
            unfollowers += uniqBy(data.unfollowers, 'id').length;
            followers += (data.followers) ? data.followers.length : 0;

            const category = data.twitterDM ? 'enabled' : 'legacy-disabled';
            await Promise.all([
                redis.zadd('users', timestamp.toString(), id),
                redis.zadd(`users:${category}`, timestamp.toString(), id),
                redis.hmset(`user:${id}`, { token, tokenSecret: secret }),
                redis.zadd('cachedTwittos', timestamp.toString(), id),
                redis.hmset(`cachedTwitto:${id}`, { picture: photo, username }),
            ]);
            if (data.followers) {
                await Promise.all(
                    data.followers.map((follower: { id: string, _id: any, since: any }) => {
                        const followTimestamp = Number(new Date(follower.since.$date));
                        return Promise.all([
                            redis.zadd(`followers:${id}`, followTimestamp.toString(), follower.id),
                            redis.zadd(`followers:not-cached:${id}`, followTimestamp.toString(), follower.id),
                        ]);
                    }),
                );
            }
        }
        return data;
    }))
    .on('close', () => defer(async () => {
        logger.info('finished - %d users, total followers %d, total unfollowers %d', i, followers, unfollowers);

        await redis.set('total-unfollowers-legacy', unfollowers);
        await redis.disconnect();
    }));
