import Redis from 'ioredis';
import {DataTypes, Model, ModelCtor, Sequelize} from 'sequelize';

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

interface ICachedUsername extends Model {twitterId: string, username: string}

export default class Dao {
    private readonly redis: Redis.Redis;
    private readonly sequelize: Sequelize;

    private readonly CachedUsername: ModelCtor<ICachedUsername>;

    constructor(
        redis = new Redis(process.env.REDIS_URI, { lazyConnect: true }),
        sequelize = new Sequelize(process.env.POSTGRES_URI, { logging: false })
    ) {
        this.redis = redis;
        this.sequelize = sequelize;

        this.CachedUsername = this.sequelize.define('CachedUsername', {
            twitterId: { type: DataTypes.STRING(30), allowNull: false, primaryKey: true },
            username: { type: DataTypes.STRING(15), allowNull: false }
        });
    }

    /**
     * Wait for the databases to be connected, and create the tables if necessary
     */
    public async load(): Promise<Dao> {
        await this.sequelize.authenticate(); // check that postgresql is connected
        await this.CachedUsername.sync(); // create the missing postgresql tables
        await this.redis.connect(); // wait for redis to load its data
        return this;
    }

    public async disconnect() {
        await Promise.all([
            this.sequelize.close(),
            this.redis.quit(),
        ]);
    }

    public getUserDao(userId: string) {
        return new UserDao(userId, this.redis, this);
    }

    public async addUser(userEgg: IUserEgg): Promise<void> {
        userEgg = {category: UserCategory.enabled, ...userEgg};
        const { id, category, username,
            added_at, lang, token, tokenSecret, photo, dmId, dmToken, dmTokenSecret, dmPhoto } = userEgg;
        const params: IUserParams = { added_at, lang, token, tokenSecret, photo,
            dmId, dmToken, dmTokenSecret, dmPhoto };
        await Promise.all([
            this.redis.zadd('users', category.toString(), id),
            this.redis.hmset(`user:${id}`, params as any), // string literal not accepted as a type
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
        return (await this.CachedUsername.findByPk(userId))?.username || null;
    }

    public async addTwittoToCache(twittoInfo: ITwittoInfo, time = Date.now()): Promise<void> {
        const { id, username } = twittoInfo;
        await this.CachedUsername.upsert({twitterId: id, username});
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
