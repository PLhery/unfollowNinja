import * as Redis from 'ioredis';
import { fromPairs } from 'lodash';
import * as Twit from 'twit';
import { IUnfollowerInfo, Lang } from '../utils/types';
import { twitterCursorToTime } from '../utils/utils';
import { UserCategory } from './dao';

export default class UserDao {
    private readonly redis: Redis.Redis;
    private readonly userId: string;

    constructor(userId: string, redis = new Redis()) {
        this.redis = redis;
        this.userId = userId;
    }

    public disconnect() {
        return this.redis.disconnect();
    }

    public async setCategory(category: UserCategory): Promise<void> {
        await this.redis.zadd('users', category.toString(), this.userId);
    }

    // get the minimum timestamp required to do the next followers check
    // e.g if there are not enough requests left, it's twitter's next reset time
    // e.g if a check needs 4 requests, it's probably in 3min30 (twitter limit = 15/15min)
    // (default: 0)
    public async getNextCheckTime(): Promise<number> {
        return this.redis.get(`nextCheckTime:${this.userId}`)
            .then((nextCheckTime) => Number(nextCheckTime));
    }

    // see above
    public async setNextCheckTime(nextCheckTime: number|string): Promise<void> {
        await this.redis.set(`nextCheckTime:${this.userId}`, nextCheckTime.toString());
    }

    // get twitter instance with refreshed user's credentials
    public async getTwit(): Promise<Twit> {
        const [ token, tokenSecret ] = await this.redis.hmget(`user:${this.userId}`, 'token', 'tokenSecret');
        return new Twit({
            access_token:         token,
            access_token_secret:  tokenSecret,
            consumer_key:         process.env.CONSUMER_KEY,
            consumer_secret:      process.env.CONSUMER_SECRET,
        });
    }

    // get DM twitter instance with refreshed user's credentials
    public async getDmTwit(): Promise<Twit> {
        const [ dmToken, dmTokenSecret ] = await this.redis.hmget(`user:${this.userId}`, 'dmToken', 'dmTokenSecret');
        return new Twit({
            access_token: dmToken,
            access_token_secret: dmTokenSecret,
            consumer_key: process.env.DM_CONSUMER_KEY,
            consumer_secret: process.env.DM_CONSUMER_SECRET,
        });
    }

    public async getLang(): Promise<Lang> {
        return await this.redis.hget(`user:${this.userId}`, 'lang') as Lang;
    }

    // list of follower IDs stored during last checkFollowers (in Twitter's order)
    // return null if there are no IDs
    public async getFollowers(): Promise<string[]> {
        return JSON.parse(await this.redis.get(`followers:${this.userId}`));
    }

    public async updateFollowers(
        followers: string[], // every follower, in Twitter's order
        newFollowers: string[], // followers to add
        unfollowers: string[], // followers to remove
        addedTime: number, // timestamp in ms for new followers
    ): Promise<void> {
        const notCachedDict = fromPairs(newFollowers.map(followerId => [followerId, addedTime.toString()]));
        await Promise.all([
            this.redis.set(`followers:${this.userId}`, JSON.stringify(followers)),
            this.redis.set(`followers:count:${this.userId}`, followers.length.toString()),
            newFollowers.length > 0 && this.redis.hmset(`followers:follow-time:${this.userId}`, notCachedDict),
            unfollowers.length > 0 && this.redis.hdel(`followers:follow-time:${this.userId}`, ...unfollowers),
            unfollowers.length > 0 && this.removeFollowerSnowflakeIds(unfollowers),
            unfollowers.length > 0 && this.redis.srem(`followers:uncachable:${this.userId}`, ...unfollowers),
            unfollowers.length > 0 && this.redis.incrby('total-unfollowers', unfollowers.length),
        ]);
    }

    public async setFollowerSnowflakeId(followerId: string, snowflakeId: string): Promise<void> {
        await Promise.all([
            this.redis.hset(`followers:snowflake-ids:${this.userId}`, followerId, snowflakeId),
        ]);
    }

    // get twitter cached snowflakeId (containing the follow timing information)
    // returns null if not cached yet
    public async getFollowerSnowflakeId(followerId: string): Promise<string> {
        return this.redis.hget(`followers:snowflake-ids:${this.userId}`, followerId);
    }

    public async removeFollowerSnowflakeIds(followerIds: string[]): Promise<void> {
        await this.redis.hdel(`followers:snowflake-ids:${this.userId}`, ...followerIds);
    }

    // Some followers ids weirdly can't be cached (disabled?)
    public async getUncachableFollowers(): Promise<string[]> {
        return this.redis.smembers(`followers:uncachable:${this.userId}`);
    }

    public async addUncachableFollower(followerId: string): Promise<void> {
        await this.redis.sadd(`followers:uncachable:${this.userId}`, followerId);
    }

    // get the timestamp (in ms) when the follower followed the user.
    // determined from the cached snowflakeId or from the time it was added in DB
    public async getFollowTime(followerId: string): Promise<number> {
        return twitterCursorToTime(await this.getFollowerSnowflakeId(followerId)) ||
            this.getFollowDetectedTime(followerId);
    }

    // get the timestamp when the follower was added to the db (in ms)
    public async getFollowDetectedTime(followerId: string): Promise<number> {
        return Number(await this.redis.hget(`followers:follow-time:${this.userId}`, followerId));
    }

    // Add some unfollowers to the list of unfollowers (without removing them from the followers)
    public async addUnfollowers(unfollowersInfo: IUnfollowerInfo[]) {
        await this.redis.lpush(`unfollowers:${this.userId}`, ...unfollowersInfo.map(info => JSON.stringify(info)));
    }

    // return true if some followers were never cached by cacheFollowers
    public async getHasNotCachedFollowers(): Promise<boolean> {
        const nbCached = Number(await this.redis.hlen(`followers:snowflake-ids:${this.userId}`));
        const nbUncachable = Number(await this.redis.scard(`followers:uncachable:${this.userId}`));
        const nbFollowers = Number(await this.redis.get(`followers:count:${this.userId}`));
        return nbCached + nbUncachable < nbFollowers;
    }

    public async addFollowTimes(notCachedFollowers: Array<{followTime: string, id: string}>): Promise<void> {
        const notCachedDict = fromPairs(notCachedFollowers.map(f => [f.id, f.followTime]));
        await this.redis.hmset(`followers:follow-time:${this.userId}`, notCachedDict);
    }

    public async getCachedFollowers(): Promise<string[]> {
        return this.redis.hkeys(`followers:snowflake-ids:${this.userId}`);
    }
}
