import Redis from 'ioredis';
import {ITwittoInfo, IUserEgg, IUserParams, Session} from '../utils/types';
import UserDao from './userDao';

export enum UserCategory {
    enabled,
    suspended,
    revoked,
    disabled,
    dmclosed,
    accountClosed,
}

export default class Dao {
    private readonly redis: Redis.Redis;

    constructor(redis = new Redis(process.env.REDIS_URI)) {
        this.redis = redis;
    }

    public disconnect() {
        return this.redis.disconnect();
    }

    public getUserDao(userId: string) {
        return new UserDao(userId, this.redis);
    }

    public async addUser(userEgg: IUserEgg): Promise<void> {
        userEgg = {category: UserCategory.enabled, ...userEgg};
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

    public async getUserCountByCategory(): Promise<Record<UserCategory, number>> {
        const nbCategory = Object.keys(UserCategory).length / 2; // not super clean but I have no better idea
        const counts = await Promise.all(
            new Array(nbCategory)
                .fill(null)
                .map((_, category) => this.redis.zcount('users', category, category))
        );
        return Object.fromEntries(
            counts.map((count, category) => [category, count])
        ) as Record<UserCategory, number>;
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

    public async getSession(uid: string): Promise<Session> {
        return JSON.parse(await this.redis.get(`session:${uid}`) || '{}');
    }

    public async setSession(uid: string, params: Record<string, string>): Promise<void> {
        await this.redis.set(`session:${uid}`, JSON.stringify(params));
        await this.redis.expire(`session:${uid}`, 3600); // 1h sessions
    }

    public async getTokenSecret(token: string): Promise<string> {
        return await this.redis.get(`tokensecret:${token}`) || null;
    }

    public async setTokenSecret(token: string, secret: string): Promise<void> {
        await this.redis.set(`tokensecret:${token}`, secret);
        await this.redis.expire(`tokensecret:${token}`, 1200); // 20min memory (lasts <10min on twitter side)
    }
}
