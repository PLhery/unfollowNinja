import type { Sequelize } from 'sequelize';
import {DataTypes, Model, ModelCtor} from 'sequelize';
import * as Sentry from '@sentry/node';

import type { default as Dao } from './dao';

export enum WebEvent {
  createAccount,
  signIn,
  addDmAccount,
  addedAsSomeonesDmAccount,
  disable,
  logout,
  setLang,
  adminFetchUser,
}

// TODO
// export enum FollowerEventType {
//   newFollower,
//   newUnfollower,
//   newPotentialFollower,
// }
//
// export enum MessageEventType {
//   welcomeMessageSent,
//   followersMessageSent,
// }

interface IWebEvent extends Model {
  userId: string,
  event: WebEvent,
  ip: string,
  extraInfo?: string,
}

export default class UserEventDao {
    public readonly sequelizeLogs: Sequelize;
    private readonly dao: Dao;
    private webEvent: ModelCtor<IWebEvent>;

    constructor(dao: Dao) {
        this.dao = dao;
        this.sequelizeLogs = dao.sequelizeLogs;

        this.webEvent = dao.sequelizeLogs.define('WebEvent', {
          userId: { type: DataTypes.STRING(30), allowNull: false },
          event: { type: DataTypes.INTEGER, allowNull: false },
          ip: { type: DataTypes.STRING(45), allowNull: false },
          username: { type: DataTypes.STRING(20), allowNull: false }, // either the user's or the extraInfo one
          extraInfo: { type: DataTypes.STRING(30), allowNull: true }, // lang, DM account ID or admin fetched ID
        }, {
          timestamps: true,
          updatedAt: false, // We'll never update these fields
          indexes: [{ fields: ['userId'] }]
        });
    }

    public async createTables() {
      await this.webEvent.sync({ alter: true });
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
}
