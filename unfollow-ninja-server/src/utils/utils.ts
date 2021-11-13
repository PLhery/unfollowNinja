// Convert an ID generated with snowflake (e.g some cursors) to a timestamp in ms
import bigInt from 'big-integer';

/**
 * get the timestamp associated with a Twitter's cursor
 */
export function twitterCursorToTime(cursor: string): number {
    return cursor ? bigInt(cursor).abs().shiftRight(20).valueOf() : null;
}
