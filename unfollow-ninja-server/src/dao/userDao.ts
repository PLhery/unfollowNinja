import Redis from 'ioredis';
import { fromPairs } from 'lodash';
import Twit from 'twit';
import type { default as Dao, UserCategory } from './dao';
import {IUnfollowerInfo, IUserParams, Lang} from '../utils/types';
import { twitterCursorToTime } from '../utils/utils';

export default class UserDao {
    private readonly redis: Redis.Redis;
    private readonly dao: Dao;
    private readonly userId: string;

    constructor(userId: string, redis = new Redis(process.env.REDIS_URI), dao: Dao) {
        this.redis = redis;
        this.userId = userId;
        this.dao = dao;
    }

    public disconnect() {
        return this.redis.disconnect();
    }

    public getUsername(): Promise<string> {
        return this.dao.getCachedUsername(this.userId)
    }

    public async getCategory(): Promise<UserCategory> {
        return Number(await this.redis.zscore('users', this.userId));
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

    public async getUserParams(): Promise<IUserParams> {
        const stringUserParams = await this.redis.hgetall(`user:${this.userId}`) as Record<keyof IUserParams, string>;
        return {
            ...stringUserParams,
            added_at: parseInt(stringUserParams.added_at, 10),
            lang: stringUserParams.lang as Lang,
        };
    }

    public async setUserParams(userParams: Partial<IUserParams>): Promise<void> {
        await this.redis.hmset(`user:${this.userId}`, userParams);
    }

    // get twitter instance with refreshed user's credentials
    public async getTwit(): Promise<Twit> {
        const [ token, tokenSecret ] = await this.redis.hmget(`user:${this.userId}`, 'token', 'tokenSecret');
        if (!token || !tokenSecret) {
            throw new Error('Tried to create a new Twit client but the user didn\'t have any credentials stored');
        }
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
        if (!dmToken || !dmTokenSecret) {
            throw new Error('Tried to create a new Twit DM client but the user didn\'t have any DM credentials stored');
        }
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
        // TODO: store this in mongodb
        // await this.redis.lpush(`unfollowers:${this.userId}`, ...unfollowersInfo.map(info => JSON.stringify(info)));
    }

    // return true if some followers were never cached by cacheFollowers
    public async getHasNotCachedFollowers(): Promise<boolean> {
        const nbCached = Number(await this.redis.hlen(`followers:snowflake-ids:${this.userId}`));
        const nbUncachable = Number(await this.redis.scard(`followers:uncachable:${this.userId}`));
        const nbFollowers = Number(await this.redis.get(`followers:count:${this.userId}`));
        return nbCached + nbUncachable < nbFollowers;
    }

    public async getCachedFollowers(): Promise<string[]> {
        return this.redis.hkeys(`followers:snowflake-ids:${this.userId}`);
    }

    public async getAllUserData() {
        const [ username, category, nextCheckTime, userParams, followers, followTimes, uncachables, snowflakeIds] =
            await Promise.all([
                this.redis.hget('cachedTwittos', `${this.userId}:username`),
                this.getCategory(),
                this.getNextCheckTime(),
                this.getUserParams(),
                this.getFollowers(),
                this.redis.hgetall(`followers:follow-time:${this.userId}`),
                this.redis.smembers(`followers:uncachable:${this.userId}`),
                this.redis.hgetall(`followers:snowflake-ids:${this.userId}`),
        ]);

        return {
            username,
            category,
            nextCheckTime,
            userParams,
            followers,
            followTimes,
            uncachables,
            snowflakeIds,
        };
    }

    // Not safe (some tasks for that user may still exist)
    // But can be used for disabled account
    public async deleteUser(): Promise<void> {
        await Promise.all([
            this.redis.zrem(`users`, this.userId),
            this.redis.del(
                `nextCheckTime:${this.userId}`,
                `user:${this.userId}`,
                `followers:${this.userId}`,
                `followers:count:${this.userId}`,
                `followers:follow-time:${this.userId}`,
                `followers:uncachable:${this.userId}`,
                `followers:snowflake-ids:${this.userId}`,
            ),
        ]);
    }
}
