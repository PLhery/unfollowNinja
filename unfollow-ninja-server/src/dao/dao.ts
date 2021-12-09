import Redis from 'ioredis';
import {DataTypes, Model, ModelCtor, Sequelize} from 'sequelize';

import {ITwittoInfo, IUserEgg, IUserParams, Session} from '../utils/types';
import UserDao from './userDao';
import UserEventDao from './userEventDao';

export enum UserCategory {
    enabled,
    suspended,
    revoked,
    disabled,
    dmclosed,
    accountClosed,
    vip
}

interface ICachedUsername extends Model {twitterId: string, username: string}
export interface IFriendCode extends Model {code: string, userId: string, friendId?: string}

export default class Dao {
    public readonly redis: Redis.Redis;
    public readonly sequelize: Sequelize;
    public readonly sequelizeLogs: Sequelize;
    public readonly userEventDao: UserEventDao;

    private readonly CachedUsername: ModelCtor<ICachedUsername>;
    public readonly FriendCode: ModelCtor<IFriendCode>;

    constructor(
        redis = new Redis(process.env.REDIS_URI, { lazyConnect: true }),
        sequelize = new Sequelize(process.env.POSTGRES_URI, { logging: false }),
        sequelizeLogs = new Sequelize(process.env.POSTGRES_LOGS_URI, { logging: false })
    ) {
        this.redis = redis;
        this.sequelize = sequelize;
        this.sequelizeLogs = sequelizeLogs;

        this.CachedUsername = this.sequelize.define('CachedUsername', {
            twitterId: { type: DataTypes.STRING(30), allowNull: false, primaryKey: true },
            username: { type: DataTypes.STRING(20), allowNull: false }
        });
        this.FriendCode = this.sequelize.define('FriendCode', {
          code: { type: DataTypes.STRING(6), allowNull: false, primaryKey: true },
          userId: { type: DataTypes.STRING(30), allowNull: false },
          friendId: { type: DataTypes.STRING(30), allowNull: true }
        },{
          indexes: [{ fields: ['userId'] }, { fields: ['friendId'] }]
        });
        this.userEventDao = new UserEventDao(this);
    }

    /**
     * Wait for the databases to be connected, and create the tables if necessary
     */
    public async load(): Promise<Dao> {
        await Promise.all([ // check that postgresql is connected
          await this.sequelize.authenticate(),
          await this.sequelizeLogs.authenticate(),
        ]);
        await this.CachedUsername.sync({ alter: true }); // create the missing postgresql tables
        await this.FriendCode.sync({ alter: true });
        await this.userEventDao.createTables();
        await this.redis.connect(); // wait for redis to load its data
        return this;
    }

    public async disconnect() {
        this.redis.disconnect()
        await Promise.all([
            this.sequelize.close(),
            this.sequelizeLogs.close(),
        ]);
    }

    public getUserDao(userId: string) {
        return new UserDao(userId, this);
    }

    public async addUser(userEgg: IUserEgg): Promise<void> {
        const { id, category, username, added_at, lang, token, tokenSecret, dmId,
          dmToken, dmTokenSecret, pro, customerId } = userEgg;
        const params: IUserParams = {added_at, lang, token, tokenSecret, dmId, dmToken, dmTokenSecret, pro, customerId};
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

    public async getCachedUserId(username: string): Promise<string> {
      return (await this.CachedUsername.findOne({where:{username}}))?.twitterId || null;
    }

    public async addTwittoToCache(twittoInfo: ITwittoInfo, time = Date.now()): Promise<void> {
        const { id, username } = twittoInfo;
        if (username.length > 20 && username.startsWith('erased_')) {
          return; // these are weird deleted users 'erased_{userid}'
        }
        await this.CachedUsername.upsert({twitterId: id, username});
    }

    public async getSession(uid: string): Promise<Session> {
        return JSON.parse(await this.redis.get(`session:${uid}`) || '{}');
    }

    public async setSession(uid: string, params: Record<string, string>): Promise<void> {
        await this.redis.set(`session:${uid}`, JSON.stringify(params));
        await this.redis.expire(`session:${uid}`, 3600); // 1h sessions
    }

    public async deleteSession(uid: string): Promise<void> {
        await this.redis.del(`session:${uid}`);
    }

    public async getTokenSecret(token: string): Promise<string> {
        return await this.redis.get(`tokensecret:${token}`) || null;
    }

    public async setTokenSecret(token: string, secret: string): Promise<void> {
        await this.redis.set(`tokensecret:${token}`, secret);
        await this.redis.expire(`tokensecret:${token}`, 1200); // 20min memory (lasts <10min on twitter side)
    }
}
