
// Convert an ID generated with snowflake (e.g some cursors) to a timestamp in ms
export function twitterSnowflakeToTime(snowflakeId: string): number {
    const TWEPOCH = 1288834974657; // from https://github.com/twitter/snowflake/... https://git.io/fNzsb
    // tslint:disable-next-line:no-bitwise
    return snowflakeId ? (parseInt(snowflakeId, 10) >> 22) + TWEPOCH : null;
}
