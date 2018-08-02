// Convert an ID generated with snowflake (e.g some cursors) to a timestamp in ms
import * as bigInt from 'big-integer';
import { Redis } from 'ioredis';
import * as Twit from 'twit';

// get the timestamp (in ms, although it's not precise to the ms) when a twitter's snowflake ID was generated
export function twitterSnowflakeToTime(snowflakeId: string): number {
    // const TWEPOCH = 1288834974657; // from https://github.com/twitter/snowflake/... https://git.io/fNzsb
    const TWEPOCH = 1149719482000; // determined empirically
    // tslint:disable-next-line:no-bitwise
    return snowflakeId ? bigInt(snowflakeId).shiftRight(22).valueOf() + TWEPOCH : null;
}
