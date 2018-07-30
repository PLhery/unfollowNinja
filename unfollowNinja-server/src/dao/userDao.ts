import * as Redis from 'ioredis';
import {flatMap, fromPairs} from 'lodash';
import * as Twit from 'twit';
import {IUnfollowerInfo} from '../utils/types';
import {twitterSnowflakeToTime} from '../utils/utils';
import { UserCategory } from './dao';

export default class UserDao {
    private redis: Redis.Redis;
    private userId: string;

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

    // list of follower IDs stored during last checkFollowers
    public async getFollowers(): Promise<string[]> {
        return this.redis.zrange(`followers:${this.userId}`, 0, -1);
    }

    // list of follower IDs in Twitter's order
    public async getFollowersOrdered(): Promise<string[]> {
        return JSON.parse(await this.redis.get(`followersList:${this.userId}`));
    }

    // we need all the followers (2nd param) in Twitter's order to know their position to be able..
    // ..to cache their snowflakeId (if someone was disabled an re enabled it can appear in the middle)
    // addedTime is a timestamp in ms
    public async addFollowers(newFollowers: string[], followers: string[], addedTime: number|string): Promise<void> {
        const notCachedDict = fromPairs(newFollowers.map(followerId => [followerId, addedTime.toString()]));
        await Promise.all([
            this.redis.zadd(`followers:${this.userId}`, ...flatMap(newFollowers, followerId => ['0', followerId])),
            this.redis.hmset(`followers:not-cached:${this.userId}`, notCachedDict),
            this.redis.set(`followersList:${this.userId}`, JSON.stringify(followers)),
        ]);
    }

    // unfollowers: followers to remove
    // folloers: every follower, in Twitter's order
    public async removeFollowers(unfollowers: string[], followers: string[]): Promise<void> {
        await Promise.all([
            this.redis.zrem(`followers:${this.userId}`, ...unfollowers),
            this.redis.hdel(`followers:not-cached:${this.userId}`, ...unfollowers),
            this.redis.set(`followersList:${this.userId}`, JSON.stringify(followers)),
        ]);
    }

    public async setFollowerSnowflakeId(followerId: string, snowflakeId: string): Promise<void> {
        await Promise.all([
            this.redis.zadd(`followers:${this.userId}`, snowflakeId, followerId),
            this.redis.zrem(`followers:not-cached:${this.userId}`, followerId),
        ]);
    }

    // get twitter cached snowflakeId (containing the follow timing information)
    // returns null if not cached yet
    public async getFollowerSnowflakeId(followerId: string): Promise<string> {
        // TODO improve this (Number(bigInt) is not exact)
        return Number(await this.redis.zscore(`followers:${this.userId}`, followerId)).toString();
    }

    // get the timestamp (in ms) when the follower followed the user.
    // determined from the cached snowflakeId or from the time it was added in DB
    public async getFollowTime(followerId: string): Promise<number> {
        return twitterSnowflakeToTime(await this.getFollowerSnowflakeId(followerId)) ||
            Number(await this.redis.zscore(`followers:not-cached:${this.userId}`, followerId));
    }

    // Add some unfollowers to the list of unfollowers (without removing them from the followers)
    public async addUnfollowers(unfollowersInfo: IUnfollowerInfo[]) {
        await this.redis.lpush(`unfollowers:${this.userId}`, ...unfollowersInfo.map(info => JSON.stringify(info)));
    }

    // return true if some followers were never cached by cacheFollowers
    public async getHasNotCachedFollowers(): Promise<boolean> {
        return Number(await this.redis.hlen(`followers:not-cached:${this.userId}`)) > 0;
    }

    public async getNotCachedFollowers(): Promise<string[]> {
        return this.redis.hkeys(`followers:not-cached:${this.userId}`);
    }
}
