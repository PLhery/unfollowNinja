import Redis from 'ioredis';
import { fromPairs } from 'lodash';
import Twit from 'twit';
import { TwitterApi } from 'twitter-api-v2';
import crypto from 'crypto';

import type {default as Dao, IFriendCode} from './dao';
import { UserCategory } from './dao';
import type { IUserParams, Lang } from '../utils/types';
import { twitterCursorToTime } from '../utils/utils';
import {Op} from "sequelize";

export default class UserDao {
    private readonly redis: Redis.Redis;
    private readonly dao: Dao;
    private readonly userId: string;

    constructor(userId: string, dao: Dao) {
        this.userId = userId;
        this.dao = dao;

        this.redis = dao.redis;
    }

    public getUsername(): Promise<string> {
        return this.dao.getCachedUsername(this.userId)
    }

    public async getCategory(): Promise<UserCategory> {
        return Number((await this.redis.zscore('users', this.userId)) ?? 3); // default = disabled
    }

    public async setCategory(category: UserCategory): Promise<void> {
        this.dao.userEventDao.logCategoryEvent(this.userId, category, await this.getCategory());
        await this.redis.zadd('users', category.toString(), this.userId);
    }

    public async enable(): Promise<UserCategory.enabled | UserCategory.vip> {
      const proParam = await this.redis.hget(`user:${this.userId}`, 'pro');
      if (Number(proParam) > 0) {
        await this.setCategory(UserCategory.vip)
        return UserCategory.vip;
      } else {
        await this.setCategory(UserCategory.enabled)
        return UserCategory.enabled;
      }
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
            pro: (stringUserParams.pro || '0') as '3' | '2' | '1' | '0',
        };
    }

    public async setUserParams(userParams: Partial<IUserParams>): Promise<void> {
        await this.redis.hmset(`user:${this.userId}`, userParams);
    }

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

    public async getTwitterApi(): Promise<TwitterApi> {
      const [ token, tokenSecret ] = await this.redis.hmget(`user:${this.userId}`, 'token', 'tokenSecret');
      if (!token || !tokenSecret) {
        throw new Error('Tried to create a new twitter client but the user didn\'t have any credentials stored');
      }
      return new TwitterApi({
        accessToken: token,
        accessSecret: tokenSecret,
        appKey: process.env.CONSUMER_KEY,
        appSecret: process.env.CONSUMER_SECRET,
      });
    }

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

    public async getDmTwitterApi(): Promise<TwitterApi> {
      const [ dmToken, dmTokenSecret ] = await this.redis.hmget(`user:${this.userId}`, 'dmToken', 'dmTokenSecret');
      if (!dmToken || !dmTokenSecret) {
        throw new Error('Tried to create a new Twit DM client but the user didn\'t have any DM credentials stored');
      }
      return new TwitterApi({
        accessToken: dmToken,
        accessSecret: dmTokenSecret,
        appKey: process.env.DM_CONSUMER_KEY,
        appSecret: process.env.DM_CONSUMER_SECRET,
      });
    }

    public async getLang(): Promise<Lang> {
        return await this.redis.hget(`user:${this.userId}`, 'lang') as Lang;
    }

    public async isPro(): Promise<boolean> {
      return Number(await this.redis.hget(`user:${this.userId}`, 'pro')) > 0;
    }

    public getDmId(): Promise<string> {
      return this.redis.hget(`user:${this.userId}`, 'dmId');
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

    public async getFriendCodes(): Promise<IFriendCode[]> {
      return await this.dao.FriendCode.findAll({where: {userId: this.userId}});
    }

    public async getFriendCodesWithUsername(): Promise<{code: string, friendUsername: string}[]> {
      return Promise.all(
        (await this.dao.FriendCode.findAll({where: {userId: this.userId}}))
          .map(async (code) => ({
            code: code.code,
            friendUsername: code.friendId && await this.dao.getCachedUsername(code.friendId),
          }))
      );
    }

    // Add friend codes until there are 5 of them
    public async addFriendCodes(): Promise<void> {
      const nbCodes = (await this.getFriendCodes()).length;
      if (nbCodes > 5) {
        throw new Error(this.userId +' has more than 5 friend codes - should not happen')
      }
      for (let i=0; i<5-nbCodes; ++i) {
        const code = crypto.randomBytes(3).toString('hex').toUpperCase();
        await this.dao.FriendCode.create({userId: this.userId, code});
      }
    }

    public async deleteFriendCodes(code: string): Promise<void> {
      await this.dao.FriendCode.destroy({where: {userId: this.userId, code}});
    }

    public async registerFriendCode(code: string): Promise<boolean> {
      const [nbUpdates] = await this.dao.FriendCode.update({friendId: this.userId}, {where: {code, friendId: null}});
      return nbUpdates === 1;
    }

  public async getRegisteredFriendCode(): Promise<IFriendCode> {
      return await this.dao.FriendCode.findOne({where: {friendId: this.userId}});
  }

    public async getAllUserData() {
        const [ username, category, nextCheckTime, userParams, followers, friendCodes,
          registeredFriendCode, followTimes, uncachables, snowflakeIds] =
            await Promise.all([
                this.getUsername(),
                this.getCategory(),
                this.getNextCheckTime(),
                this.getUserParams(),
                this.getFollowers(),
                this.getFriendCodes(),
                this.getRegisteredFriendCode(),
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
            friendCodes,
            registeredFriendCode,
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
        await this.dao.FriendCode.destroy({where: {userId: this.userId}});
    }
}
