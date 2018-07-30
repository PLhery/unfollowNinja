// Convert an ID generated with snowflake (e.g some cursors) to a timestamp in ms
import * as bigInt from 'big-integer';
import { Redis } from 'ioredis';
import * as Twit from 'twit';

export function twitterSnowflakeToTime(snowflakeId: string): number {
    // const TWEPOCH = 1288834974657; // from https://github.com/twitter/snowflake/... https://git.io/fNzsb
    const TWEPOCH = 1149719482000; // determined empirically
    // tslint:disable-next-line:no-bitwise
    return snowflakeId ? bigInt(snowflakeId).shiftRight(22).valueOf() + TWEPOCH : null;
}

export async function getTwit(redis: Redis, userId: string): Promise<Twit> {
    const { token, tokenSecret } = await redis.hgetall(`user:${userId}`);
    return new Twit({
        access_token:         token,
        access_token_secret:  tokenSecret,
        consumer_key:         process.env.CONSUMER_KEY,
        consumer_secret:      process.env.CONSUMER_SECRET,
    });
}
