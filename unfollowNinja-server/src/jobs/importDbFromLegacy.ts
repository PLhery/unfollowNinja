// This job parses db export and import it in redis.
// It will be useful to - benchmark against the legacy backend & migrate from the legacy backend
import 'dotenv/config';

import * as es from 'event-stream';
import * as fs from 'fs';
import * as JSONStream from 'jsonstream';
import {defer, uniqBy} from 'lodash';

import Dao, {UserCategory} from '../dao/dao';
import logger from '../utils/logger';

const LEGACY_JSON_FILE_PATH = process.env.JOBS_LEGACY_JSON_FILE || '';

const dao = new Dao();

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

            await dao.addUser({
                added_at: timestamp,
                category: data.twitterDM ? UserCategory.enabled : UserCategory.disabled,
                id,
                lang: 'fr',
                picture: photo,
                token,
                tokenSecret: secret,
                username,
            });
            if (data.followers) {
                const userDao = dao.getUserDao(id);
                await Promise.all([
                    userDao.updateFollowers(data.followers.map((f: any) => f.id),  [], [], 0),
                    userDao.addFollowTimes(
                        data.followers.map((f: any) => ({id: f.id, followTime: Number(new Date(f.since.$date))})),
                    ),
                ]);
            }
        }
    }))
    .on('close', () => defer(async () => {
        logger.info('finished - %d users, total followers %d, total unfollowers %d', i, followers, unfollowers);

        await dao.setTotalUnfollowersLegacy(unfollowers);
        await dao.disconnect();
    }));
