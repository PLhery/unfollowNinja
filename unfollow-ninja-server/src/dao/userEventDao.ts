import type { InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';
import { DataTypes, Model } from 'sequelize';
import type { ModelStatic } from 'sequelize/types/model';
import * as Sentry from '@sentry/node';

import type { default as Dao } from './dao';
import type { IUnfollowerInfo } from '../utils/types';
import { UserCategory } from './dao';

export enum WebEvent {
    createAccount,
    signIn,
    addDmAccount,
    addedAsSomeonesDmAccount,
    disable,
    logout,
    setLang,
    adminFetchUser,
    tryFriendCode,
    enablePro,
    enableFriends,
    registeredAsFriend,
    disablePro,
    disableFriendRegistration,
}

interface IWebEvent extends Model<InferAttributes<IWebEvent>, InferCreationAttributes<IWebEvent>> {
    userId: string;
    username: string;
    event: WebEvent;
    ip: string;
    extraInfo?: string;
}

export enum FollowEvent {
    unfollowDetected,
    followDetected,
    accountCreatedAndFollowersLoaded,
}

interface IFollowEvent extends Model<InferAttributes<IFollowEvent>, InferCreationAttributes<IFollowEvent>> {
    userId: string;
    event: FollowEvent;
    followerId: string;
    nbFollowers: number;
}

interface IUnfollowerEvent extends Model<InferAttributes<IUnfollowerEvent>, InferCreationAttributes<IUnfollowerEvent>> {
    userId: string;
    followerId: string;
    followTime: number;
    followDetectedTime: number;
    blocking: boolean;
    blockedBy: boolean;
    suspended: boolean;
    locked: boolean;
    deleted: boolean;
    following: boolean;
    followedBy: boolean;
    skippedBecauseGlitchy: boolean;
    isSecondCheck: boolean;
}

export enum NotificationEvent {
    welcomeMessage,
    unfollowersMessage,
}

interface INotificationEvent
    extends Model<InferAttributes<INotificationEvent>, InferCreationAttributes<INotificationEvent>> {
    userId: string;
    event: NotificationEvent;
    fromId?: string;
    message: string;
    createdAt?: string;
}

interface ICategoryEvent extends Model<InferAttributes<ICategoryEvent>, InferCreationAttributes<ICategoryEvent>> {
    userId: string;
    category: UserCategory;
    formerCategory: UserCategory;
}

export default class UserEventDao {
    public readonly sequelizeLogs: Sequelize;
    private readonly dao: Dao;
    private webEvent: ModelStatic<IWebEvent>;
    private followEvent: ModelStatic<IFollowEvent>;
    private unfollowerEvent: ModelStatic<IUnfollowerEvent>;
    private notificationEvent: ModelStatic<INotificationEvent>;
    private categoryEvent: ModelStatic<ICategoryEvent>;

    constructor(dao: Dao) {
        this.dao = dao;
        this.sequelizeLogs = dao.sequelizeLogs;

        this.webEvent = dao.sequelizeLogs.define(
            'WebEvent',
            {
                userId: { type: DataTypes.STRING(30), allowNull: false },
                event: { type: DataTypes.SMALLINT, allowNull: false },
                ip: { type: DataTypes.STRING(45), allowNull: false },
                username: { type: DataTypes.STRING(20), allowNull: false }, // either the user's or the extraInfo one
                extraInfo: { type: DataTypes.STRING(30), allowNull: true }, // lang, DM account ID or admin fetched ID
            },
            {
                timestamps: true,
                updatedAt: false, // We'll never update these fields
                indexes: [{ fields: ['userId'] }],
            }
        );

        this.followEvent = dao.sequelizeLogs.define(
            'FollowEvent',
            {
                userId: { type: DataTypes.STRING(30), allowNull: false },
                event: { type: DataTypes.SMALLINT, allowNull: false },
                followerId: { type: DataTypes.STRING(30), allowNull: false },
                nbFollowers: { type: DataTypes.INTEGER, allowNull: false },
            },
            {
                timestamps: true,
                updatedAt: false, // We'll never update these fields
                indexes: [{ fields: ['userId'] }, { fields: ['followerId'] }],
            }
        );

        this.unfollowerEvent = dao.sequelizeLogs.define(
            'UnfollowerEvent',
            {
                userId: { type: DataTypes.STRING(30), allowNull: false },
                followerId: { type: DataTypes.STRING(30), allowNull: false },
                followTime: { type: DataTypes.INTEGER, allowNull: false },
                followDetectedTime: { type: DataTypes.INTEGER, allowNull: false },
                blocking: { type: DataTypes.BOOLEAN, defaultValue: false },
                blockedBy: { type: DataTypes.BOOLEAN, defaultValue: false },
                suspended: { type: DataTypes.BOOLEAN, defaultValue: false },
                locked: { type: DataTypes.BOOLEAN, defaultValue: false },
                deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
                following: { type: DataTypes.BOOLEAN, defaultValue: false },
                followedBy: { type: DataTypes.BOOLEAN, defaultValue: false },
                skippedBecauseGlitchy: { type: DataTypes.BOOLEAN, defaultValue: false },
                isSecondCheck: { type: DataTypes.BOOLEAN, defaultValue: false },
            },
            {
                timestamps: true,
                updatedAt: false, // We'll never update these fields
                indexes: [{ fields: ['userId'] }, { fields: ['followerId'] }],
            }
        );

        this.notificationEvent = dao.sequelizeLogs.define(
            'NotificationEvent',
            {
                userId: { type: DataTypes.STRING(30), allowNull: false },
                event: { type: DataTypes.SMALLINT, allowNull: false },
                fromId: { type: DataTypes.STRING(30), allowNull: true }, // null would mean an error would follow
                message: { type: DataTypes.STRING(5000), allowNull: false },
            },
            {
                timestamps: true,
                updatedAt: false, // We'll never update these fields
                indexes: [{ fields: ['userId'] }, { fields: ['fromId'] }],
            }
        );

        this.categoryEvent = dao.sequelizeLogs.define(
            'CategoryEvent',
            {
                userId: { type: DataTypes.STRING(30), allowNull: false },
                category: { type: DataTypes.SMALLINT, allowNull: false },
                formerCategory: { type: DataTypes.SMALLINT, allowNull: false },
            },
            {
                timestamps: true,
                updatedAt: false, // We'll never update these fields
                indexes: [{ fields: ['userId'] }],
            }
        );
    }

    public async createTables() {
        await this.webEvent.sync();
        await this.followEvent.sync();
        await this.unfollowerEvent.sync();
        await this.notificationEvent.sync();
        await this.categoryEvent.sync();
    }

    public logWebEvent(userId: string, event: WebEvent, ip: string, username: string, extraInfo?: string) {
        this.webEvent
            .create({ userId, event, ip, username, extraInfo })
            .catch((error) => Sentry.captureException(error));
    }

    public async getWebEvents(userId: string, limit = 500, offset = 0) {
        return (
            await this.webEvent.findAll({
                where: { userId },
                order: [['id', 'desc']],
                limit,
                offset,
            })
        ).map((event) => ({
            eventName: WebEvent[event.event],
            ...event.get(),
        }));
    }

    public logFollowEvent(userId: string, event: FollowEvent, followerId: string, nbFollowers: number) {
        this.followEvent
            .create({ userId, event, followerId, nbFollowers })
            .catch((error) => Sentry.captureException(error));
    }

    public async getFollowEvent(userId: string, limit = 500, offset = 0) {
        return (
            await this.followEvent.findAll({
                where: { userId },
                order: [['id', 'desc']],
                limit,
                offset,
            })
        ).map((event) => ({
            eventName: FollowEvent[event.event],
            ...event.get(),
        }));
    }

    public logUnfollowerEvent(userId: string, isSecondCheck: boolean, info: IUnfollowerInfo) {
        const {
            followTime,
            followDetectedTime,
            blocking,
            blocked_by,
            suspended,
            locked,
            deleted,
            following,
            followed_by,
            skippedBecauseGlitchy,
        } = info;

        this.unfollowerEvent
            .create({
                userId,
                followerId: info.id,
                followTime: Math.floor(followTime / 1000),
                followDetectedTime: Math.floor(followDetectedTime / 1000),
                blocking,
                blockedBy: blocked_by,
                suspended,
                locked,
                deleted,
                following,
                followedBy: followed_by,
                skippedBecauseGlitchy,
                isSecondCheck,
            })
            .catch((error) => Sentry.captureException(error));
    }

    public async getUnfollowerEvents(userId: string, limit = 500, offset = 0) {
        return await this.unfollowerEvent.findAll({
            where: { userId },
            order: [['id', 'desc']],
            limit,
            offset,
        });
    }

    public logNotificationEvent(userId: string, event: NotificationEvent, fromId: string, message: string) {
        this.notificationEvent
            .create({ userId, event, fromId, message })
            .catch((error) => Sentry.captureException(error));
    }

    public async getNotificationEvents(userId: string, limit = 500, offset = 0) {
        return (
            await this.notificationEvent.findAll({
                where: { userId },
                order: [['id', 'desc']],
                limit,
                offset,
            })
        ).map((event) => ({
            eventName: NotificationEvent[event.event],
            ...event.get(),
        }));
    }

    public logCategoryEvent(userId: string, category: UserCategory, formerCategory: UserCategory) {
        this.categoryEvent
            .create({ userId, category, formerCategory })
            .catch((error) => Sentry.captureException(error));
    }

    public async getCategoryEvents(userId: string, limit = 500, offset = 0) {
        return (
            await this.categoryEvent.findAll({
                where: { userId },
                order: [['id', 'desc']],
                limit,
                offset,
            })
        ).map((event) => ({
            categoryName: UserCategory[event.category],
            formerCategoryName: UserCategory[event.formerCategory],
            ...event.get(),
        }));
    }
}
