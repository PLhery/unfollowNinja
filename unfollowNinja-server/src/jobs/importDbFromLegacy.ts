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

            await redis.zadd('users', timestamp.toString(), id);
            await redis.hmset(`user:${id}`, { token, secret });
            await redis.zadd('cachedTwittos', timestamp.toString(), id);
            await redis.hmset(`cachedTwitto:${id}`, { picture: photo, username });
        }
        return data;
    }))
    .on('close', () => defer(async () => {
        logger.info('finished - %d users, total followers %d, total unfollowers %d', i, followers, unfollowers);

        await redis.set('total-unfollowers-legacy', unfollowers);
        await redis.disconnect();
    }));
