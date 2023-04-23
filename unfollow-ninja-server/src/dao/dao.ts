import Redis from 'ioredis';
import { DataTypes, Model, Sequelize } from 'sequelize';
import type { ModelStatic } from 'sequelize/types/model';
import cluster from 'cluster';

import { ITwittoInfo, IUserEgg, IUserParams, Session } from '../utils/types';
import UserDao from './userDao';
import UserEventDao from './userEventDao';

export enum UserCategory {
    enabled,
    suspended,
    revoked,
    disabled,
    dmclosed,
    accountClosed,
    vip,
}

interface ICachedUsername extends Model {
    twitterId: string;
    username: string;
}
export interface IFriendCode extends Model {
    code: string;
    userId: string;
    friendId?: string;
}

export default class Dao {
    public readonly redis: Redis;
    public readonly sequelize: Sequelize;
    public readonly sequelizeLogs: Sequelize;
    public readonly sequelizeFollowers: Sequelize;
    public readonly userEventDao: UserEventDao;

    private readonly CachedUsername: ModelStatic<ICachedUsername>;
    public readonly FriendCode: ModelStatic<IFriendCode>;

    constructor(
        redis = new Redis(process.env.REDIS_URI, { lazyConnect: true }),
        sequelize = new Sequelize(process.env.POSTGRES_URI, {
            logging: false,
            dialectOptions: {
                application_name: 'UnfollowMonkey - ' + (cluster.worker ? `worker ${cluster.worker.id}` : 'master'),
                statement_timeout: 30000,
            },
            retry: {
                match: [/Deadlock/i], // happens sometimes with addTwittosToCache
                max: 3, // Maximum rety 3 times
                backoffBase: 1000, // Initial backoff duration in ms. Default: 100,
                backoffExponent: 1.5, // Exponent to increase backoff each try. Default: 1.1
            },
        }),
        sequelizeLogs = new Sequelize(process.env.POSTGRES_LOGS_URI, {
            logging: false,
            dialectOptions: {
                application_name: 'UnfollowMonkey - ' + (cluster.worker ? `worker ${cluster.worker.id}` : 'master'),
                statement_timeout: 30000,
            },
        }),
        sequelizeFollowers = new Sequelize(process.env.POSTGRES_FOLLOWERS_URI, {
            logging: false,
            dialectOptions: {
                application_name: 'UnfollowMonkey - ' + (cluster.worker ? `worker ${cluster.worker.id}` : 'master'),
                statement_timeout: 30000,
            },
        })
    ) {
        this.redis = redis;
        this.sequelize = sequelize;
        this.sequelizeLogs = sequelizeLogs;
        this.sequelizeFollowers = sequelizeFollowers;

        this.CachedUsername = this.sequelize.define(
            'CachedUsername',
            {
                twitterId: {
                    type: DataTypes.STRING(30),
                    allowNull: false,
                    primaryKey: true,
                },
                username: { type: DataTypes.STRING(20), allowNull: false },
            },
            {
                indexes: [{ fields: ['username'] }],
            }
        );
        this.FriendCode = this.sequelize.define(
            'FriendCode',
            {
                code: { type: DataTypes.STRING(6), allowNull: false, primaryKey: true },
                userId: { type: DataTypes.STRING(30), allowNull: false },
                friendId: { type: DataTypes.STRING(30), allowNull: true },
            },
            {
                indexes: [{ fields: ['userId'] }, { fields: ['friendId'] }],
            }
        );
        this.userEventDao = new UserEventDao(this);
    }

    /**
     * Wait for the databases to be connected, and create the tables if necessary
     */
    public async load(): Promise<Dao> {
        await Promise.all([
            // check that postgresql is connected
            await this.sequelize.authenticate(),
            await this.sequelizeLogs.authenticate(),
        ]);
        await this.CachedUsername.sync(); // create the missing postgresql tables
        await this.FriendCode.sync();
        await this.userEventDao.createTables();
        await this.getUserDao('').createTables();
        await this.redis.connect(); // wait for redis to load its data
        return this;
    }

    public async disconnect() {
        this.redis.disconnect();
        await Promise.all([this.sequelize.close(), this.sequelizeLogs.close()]);
    }

    public getUserDao(userId: string) {
        return new UserDao(userId, this);
    }

    public async addUser(userEgg: IUserEgg): Promise<void> {
        const {
            id,
            category,
            username,
            added_at,
            lang,
            token,
            tokenSecret,
            isTemporarySecondAppToken,
            dmId,
            dmToken,
            dmTokenSecret,
            pro,
            customerId,
        } = userEgg;
        const params: IUserParams = {
            added_at,
            lang,
            token,
            tokenSecret,
            isTemporarySecondAppToken,
            dmId,
            dmToken,
            dmTokenSecret,
            pro,
            customerId,
        };
        await Promise.all([
            this.redis.zadd('users', category.toString(), id),
            this.redis.hmset(`user:${id}`, params),
            this.addTwittoToCache({ id, username }),
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
            new Array(nbCategory).fill(null).map((_, category) => this.redis.zcount('users', category, category))
        );
        return Object.fromEntries(counts.map((count, category) => [category, count])) as Record<UserCategory, number>;
    }

    public async getCachedUsername(userId: string): Promise<string> {
        return (await this.CachedUsername.findByPk(userId, { attributes: ['username'] }))?.username || null;
    }

    public async getCachedUserId(username: string): Promise<string> {
        return (
            (await this.CachedUsername.findOne({ where: { username }, attributes: ['twitterId'] }))?.twitterId || null
        );
    }

    public async addTwittoToCache(twittoInfo: ITwittoInfo): Promise<void> {
        const { id, username } = twittoInfo;
        if (username.length > 20 && username.startsWith('erased_')) {
            return; // these are weird deleted users 'erased_{userid}'
        }
        await this.CachedUsername.upsert({ twitterId: id, username }, { returning: false });
    }

    public async addTwittosToCache(twittosInfo: ITwittoInfo[]): Promise<void> {
        await this.CachedUsername.bulkCreate(
            twittosInfo
                .filter((twittoInfo) => !(twittoInfo.username.length > 20 && twittoInfo.username.startsWith('erased_')))
                .map((twittoInfo) => ({ twitterId: twittoInfo.id, username: twittoInfo.username })),
            {
                returning: false,
                updateOnDuplicate: ['username', 'updatedAt'],
            }
        );
    }

    public async getSession(uid: string): Promise<Session> {
        return JSON.parse((await this.redis.get(`session:${uid}`)) || '{}');
    }

    public async setSession(uid: string, params: Record<string, string>): Promise<void> {
        await this.redis.set(`session:${uid}`, JSON.stringify(params));
        await this.redis.expire(`session:${uid}`, 3600); // 1h sessions
    }

    public async deleteSession(uid: string): Promise<void> {
        await this.redis.del(`session:${uid}`);
    }

    public async getTokenSecret(token: string): Promise<string> {
        return (await this.redis.get(`tokensecret:${token}`)) || null;
    }

    public async setTokenSecret(token: string, secret: string): Promise<void> {
        await this.redis.set(`tokensecret:${token}`, secret);
        await this.redis.expire(`tokensecret:${token}`, 1200); // 20min memory (lasts <10min on twitter side)
    }
}
