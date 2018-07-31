import * as Redis from 'ioredis';
import { ITwittoInfo, IUserEgg, IUserParams } from '../utils/types';
import UserDao from './userDao';

export enum UserCategory {
    enabled,
    suspended,
    revoked,
    disabled,
}

export default class Dao {
    private readonly redis: Redis.Redis;

    constructor(redis = new Redis()) {
        this.redis = redis;
    }

    public disconnect() {
        return this.redis.disconnect();
    }

    public getRedis() {
        return this.redis;
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
        userEgg = {category: UserCategory.enabled, ...userEgg};
        const { id, category, username, picture, added_at, lang, token, tokenSecret } = userEgg;
        const params: IUserParams = { added_at, lang, token, tokenSecret };
        await Promise.all([
            this.redis.zadd('users', category.toString(), id),
            this.redis.hmset(`user:${id}`, params),
            this.addTwittoToCache({ id, picture, username }, added_at),
        ]);
    }

    public async getUserIds(): Promise<string[]> {
        return this.redis.zrange('users', 0, -1);
    }

    public async getUserIdsByCategory(category: UserCategory): Promise<string[]> {
        return this.redis.zrangebyscore('users', category, category);
    }

    public async getCachedTwitto(userId: string): Promise<ITwittoInfo> {
        const [username, picture] = await this.redis.hmget('cachedTwittos', `${userId}:username`, `${userId}:picture`);
        return username !== null ? {id: userId, username, picture} : null;
    }

    public async getCachedUsername(userId: string): Promise<string> {
        return this.redis.hget('cachedTwittos', `${userId}:username`);
    }

    public async addTwittoToCache(twittoInfo: ITwittoInfo, time = Date.now()): Promise<void> {
        const { id, username, picture } = twittoInfo;
        await Promise.all([
            this.redis.zadd('cachedTwittosIds', time.toString(), id),
            this.redis.hmset(`cachedTwittos`, `${id}:username`, username, `${id}:picture`, picture),
        ]);
    }

    // set the total numbers of unique unfollowers detected in the previous unfollowninja backend
    public async setTotalUnfollowersLegacy(nbUnfollowers: number): Promise<void> {
        return this.redis.set('total-unfollowers-legacy', nbUnfollowers.toString());
    }
}
