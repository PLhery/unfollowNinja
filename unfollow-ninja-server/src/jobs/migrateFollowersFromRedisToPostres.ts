import Redis from 'ioredis';
import { DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';

import Dao from '../dao/dao';
import logger from '../utils/logger';
import { ModelStatic } from 'sequelize/types/model';
import pLimit from 'p-limit';

interface IFollowersDetail extends Model<InferAttributes<IFollowersDetail>, InferCreationAttributes<IFollowersDetail>> {
    userId: string;
    followerId: string;
    followDetected: number;
    snowflakeId: string;
    uncachable: boolean;
}

// migrate followersDetail from redis to postgresql
async function run() {
    const redis = new Redis(process.env.REDIS_URI, { lazyConnect: true });
    const dao = new Dao(redis);
    await dao.load();

    const followersDetail: ModelStatic<IFollowersDetail> = dao.sequelize.define(
        'followersDetail',
        {
            userId: { type: DataTypes.STRING(30), allowNull: false, primaryKey: true },
            followerId: { type: DataTypes.STRING(30), allowNull: false, primaryKey: true },
            followDetected: { type: DataTypes.INTEGER, allowNull: true },
            snowflakeId: { type: DataTypes.STRING(30), allowNull: true },
            uncachable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        },
        {
            timestamps: false,
            indexes: [{ fields: ['userId'] }],
        }
    );

    const userIds = await dao.getUserIds();

    // handle 15 userIds at a time
    const limit = pLimit(15);
    const limitPromises = userIds.map((userId, progress) =>
        limit(async () => {
            if (progress < 0) {
                return;
            }
            const userDao = dao.getUserDao(userId);
            const followers = await userDao.getFollowers();

            // insert by chunk of 50 followers
            const chunks = Array.from({ length: Math.ceil(followers.length / 100) }, (v, i) =>
                followers.slice(i * 100, i * 100 + 100)
            );

            for (const chunk of chunks) {
                const rows = await Promise.all(
                    chunk.map(async (followerId) => {
                        return {
                            userId,
                            followerId,
                            followDetected: (await userDao.getFollowDetectedTime(followerId)) / 1000 || null,
                            snowflakeId: await redis.hget(`followers:snowflake-ids:${userId}`, followerId),
                            uncachable: false,
                        };
                    })
                );
                await followersDetail.bulkCreate(rows, { returning: false, ignoreDuplicates: true });
            }

            logger.info(`${progress}/${userIds.length} twittos migrated`);
        })
    );

    await Promise.all(limitPromises);
}
run().catch((error) => logger.error(error));
