// This job parses db export and import it in redis.
// It will be useful to - benchmark against the legacy backend & migrate from the legacy backend
import 'dotenv/config';

import * as es from 'event-stream';
import * as fs from 'fs';
import * as Redis from 'ioredis';
import * as JSONStream from 'jsonstream';

import logger from '../utils/logger';

const LEGACY_JSON_FILE_PATH = process.env.JOBS_LEGACY_JSON_FILE || '';

const redis = new Redis();

let i = 0;
fs.createReadStream(LEGACY_JSON_FILE_PATH)
    .pipe(JSONStream.parse('*'))
    .pipe(es.mapSync(async (data: any) => {
        if (data.twitter && data.twitterDM) {
            const { username, id, token, secret, photo } = data.twitter;

            logger.info('parsing - user n %d : @%s', i++, username);

            await redis.zadd('users', '0', id);
            await redis.hmset(`user:${id}`, { token, secret });
            await redis.zadd('cachedTwittos', '0', id);
            await redis.hmset(`cachedTwitto:${id}`, { picture: photo, username });
        }
        return data;
    }))
    .on('close', () => setTimeout(() => redis.disconnect(), 1));
