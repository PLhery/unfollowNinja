import type { Sequelize } from 'sequelize';
import { DataTypes, Model, ModelCtor } from 'sequelize';
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

interface IWebEvent extends Model {
  userId: string,
  event: WebEvent,
  ip: string,
  extraInfo?: string,
}

export enum FollowEvent {
  unfollowDetected,
  followDetected,
  accountCreatedAndFollowersLoaded,
}

interface IFollowEvent extends Model {
  userId: string,
  event: FollowEvent,
  followerId: string,
  nbFollowers: number,
}

interface IUnfollowerEvent extends Model {
  userId: string,
  followerId: string,
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

interface INotificationEvent extends Model {
  userId: string,
  event: NotificationEvent,
  fromId?: string,
  message: string,
}

interface ICategoryEvent extends Model {
  userId: string,
  category: UserCategory,
  formerCategory: UserCategory,
}

export default class UserEventDao {
    public readonly sequelizeLogs: Sequelize;
    private readonly dao: Dao;
    private webEvent: ModelCtor<IWebEvent>;
    private followEvent: ModelCtor<IFollowEvent>;
    private unfollowerEvent: ModelCtor<IUnfollowerEvent>;
    private notificationEvent: ModelCtor<INotificationEvent>;
    private categoryEvent: ModelCtor<ICategoryEvent>;

    constructor(dao: Dao) {
        this.dao = dao;
        this.sequelizeLogs = dao.sequelizeLogs;

        this.webEvent = dao.sequelizeLogs.define('WebEvent', {
          userId: { type: DataTypes.STRING(30), allowNull: false },
          event: { type: DataTypes.SMALLINT, allowNull: false },
          ip: { type: DataTypes.STRING(45), allowNull: false },
          username: { type: DataTypes.STRING(20), allowNull: false }, // either the user's or the extraInfo one
          extraInfo: { type: DataTypes.STRING(30), allowNull: true }, // lang, DM account ID or admin fetched ID
        }, {
          timestamps: true,
          updatedAt: false, // We'll never update these fields
          indexes: [{ fields: ['userId'] }]
        });

        this.followEvent = dao.sequelizeLogs.define('FollowEvent', {
          userId: { type: DataTypes.STRING(30), allowNull: false },
          event: { type: DataTypes.SMALLINT, allowNull: false },
          followerId: { type: DataTypes.STRING(30), allowNull: false },
          nbFollowers: { type: DataTypes.INTEGER, allowNull: false },
        }, {
          timestamps: true,
          updatedAt: false, // We'll never update these fields
          indexes: [{ fields: ['userId'] }, { fields: ['followerId'] }]
        });

      this.unfollowerEvent = dao.sequelizeLogs.define('UnfollowerEvent', {
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
      }, {
        timestamps: true,
        updatedAt: false, // We'll never update these fields
        indexes: [{ fields: ['userId'] }, { fields: ['followerId'] }]
      });

      this.notificationEvent = dao.sequelizeLogs.define('NotificationEvent', {
        userId: { type: DataTypes.STRING(30), allowNull: false },
        event: { type: DataTypes.SMALLINT, allowNull: false },
        fromId: { type: DataTypes.STRING(30), allowNull: true }, // null would mean an error would follow
        message: { type: DataTypes.STRING(5000), allowNull: false },
      }, {
        timestamps: true,
        updatedAt: false, // We'll never update these fields
        indexes: [{ fields: ['userId'] }, { fields: ['fromId'] }]
      });

      this.categoryEvent = dao.sequelizeLogs.define('CategoryEvent', {
        userId: { type: DataTypes.STRING(30), allowNull: false },
        category: { type: DataTypes.SMALLINT, allowNull: false },
        formerCategory: { type: DataTypes.SMALLINT, allowNull: false }
      }, {
        timestamps: true,
        updatedAt: false, // We'll never update these fields
        indexes: [{ fields: ['userId'] }]
      });
    }

    public async createTables() {
      await this.webEvent.sync({ alter: true });
      await this.followEvent.sync({ alter: true });
      await this.unfollowerEvent.sync({ alter: true });
      await this.notificationEvent.sync({ alter: true });
      await this.categoryEvent.sync({ alter: true });
    }

    public logWebEvent(userId: string, event: WebEvent, ip: string, username: string, extraInfo?: string) {
      this.webEvent.create({userId, event, ip, username, extraInfo})
        .catch((error) => Sentry.captureException(error))
    }

    public async getWebEvents(userId: string) {
      return (await this.webEvent.findAll({
        where: { userId }
      })).map((event) => ({
        eventName: WebEvent[event.event],
        ...event.get()
      }))
    }

    public logFollowEvent(userId: string, event: FollowEvent, followerId: string, nbFollowers: number) {
      this.followEvent.create({userId, event, followerId, nbFollowers})
        .catch((error) => Sentry.captureException(error))
    }

    public async getFollowEvent(userId: string) {
      return (await this.followEvent.findAll({
        where: { userId }
      })).map((event) => ({
        eventName: FollowEvent[event.event],
        ...event.get()
      }))
    }

    public logUnfollowerEvent(userId: string, isSecondCheck: boolean, info: IUnfollowerInfo) {
      const { followTime, followDetectedTime, blocking, blocked_by, suspended,
        locked, deleted, following, followed_by, skippedBecauseGlitchy } = info;

      this.unfollowerEvent.create({
        userId,
        followerId: info.id,
        followTime: Math.floor(followTime/1000),
        followDetectedTime: Math.floor(followDetectedTime/1000),
        blocking, blockedBy: blocked_by, suspended, locked, deleted,
        following, followedBy: followed_by, skippedBecauseGlitchy, isSecondCheck,
      })
        .catch((error) => Sentry.captureException(error))
    }

    public async getUnfollowerEvents(userId: string) {
      return (await this.unfollowerEvent.findAll({
        where: { userId }
      }));
    }

    public logNotificationEvent(userId: string, event: NotificationEvent, fromId: string, message: string) {
      this.notificationEvent.create({userId, event, fromId, message})
        .catch((error) => Sentry.captureException(error))
    }

    public async getNotificationEvents(userId: string) {
      return (await this.notificationEvent.findAll({
        where: { userId }
      })).map((event) => ({
        eventName: NotificationEvent[event.event],
        ...event.get()
      }))
    }

    public logCategoryEvent(userId: string, category: UserCategory, formerCategory: UserCategory) {
      this.categoryEvent.create({userId, category, formerCategory})
        .catch((error) => Sentry.captureException(error))
    }

    public async getCategoryEvents(userId: string) {
      return (await this.categoryEvent.findAll({
        where: { userId }
      })).map((event) => ({
        categoryName: UserCategory[event.category],
        formerCategoryName: UserCategory[event.formerCategory],
        ...event.get()
      }));
    }
}
