import * as Redis from 'ioredis';
import { ITwittoInfo, IUserEgg, IUserParams } from '../utils/types';
import UserDao from './userDao';

export enum UserCategory {
    enabled,
    suspended,
    revoked,
    disabled,
    new,
}

export default class Dao {
    private readonly redis: Redis.Redis;

    constructor(redis = new Redis()) {
        this.redis = redis;
    }

    public disconnect() {
        return this.redis.disconnect();
    }

    public getUserDao(userId: string) {
        return new UserDao(userId, this.redis);
    }

    // used to make sure only one scheduler is working at a time
    public async getSchedulerId(): Promise<number> {
        return Number(await this.redis.get('scheduler_id'));
    }

    // called every time a new scheduler is launched: invalidate former schedulers
    public async incrSchedulerId(): Promise<number> {
        return Number(await this.redis.incr('scheduler_id'));
    }

    public async addUser(userEgg: IUserEgg): Promise<void> {
        userEgg = {category: UserCategory.new, ...userEgg};
        const { id, category, username,
            added_at, lang, token, tokenSecret, photo, dmId, dmToken, dmTokenSecret, dmPhoto } = userEgg;
        const params: IUserParams = { added_at, lang, token, tokenSecret, photo,
            dmId, dmToken, dmTokenSecret, dmPhoto };
        await Promise.all([
            this.redis.zadd('users', category.toString(), id),
            this.redis.hmset(`user:${id}`, params),
            this.addTwittoToCache({ id, username }, added_at),
        ]);
    }

    public async getUserIds(): Promise<string[]> {
        return this.redis.zrange('users', 0, -1);
    }

    public async getUserIdsByCategory(category: UserCategory): Promise<string[]> {
        return this.redis.zrangebyscore('users', category, category);
    }

    public async getCachedTwitto(userId: string): Promise<ITwittoInfo> {
        const username = await this.redis.hget('cachedTwittos', `${userId}:username`);
        return username !== null ? {id: userId, username} : null;
    }

    public async getCachedUsername(userId: string): Promise<string> {
        return this.redis.hget('cachedTwittos', `${userId}:username`);
    }

    public async addTwittoToCache(twittoInfo: ITwittoInfo, time = Date.now()): Promise<void> {
        const { id, username } = twittoInfo;
        await Promise.all([
            this.redis.zadd('cachedTwittosIds', time.toString(), id),
            this.redis.hset(`cachedTwittos`, `${id}:username`, username),
        ]);
    }

    // set the total numbers of unique unfollowers detected in the previous unfollowninja backend
    public async setTotalUnfollowersLegacy(nbUnfollowers: number): Promise<void> {
        await this.redis.set('total-unfollowers-legacy', nbUnfollowers.toString());
    }
}
