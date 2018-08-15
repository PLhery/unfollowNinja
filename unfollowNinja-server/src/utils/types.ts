import { UserCategory } from '../dao/dao';

export type Lang = 'fr' | 'en';

export interface IFollowerInfo {
    id: string;
    followTime: number;
}

export interface IUnfollowerInfo extends IFollowerInfo {
    unfollowTime: number;
    blocking?: boolean;
    blocked_by?: boolean;
    suspended?: boolean;
    following?: boolean;
    followed_by?: boolean;
    friendship_error_code?: number;
    notified_time?: number;
    username?: string;
}

export interface ITwittoInfo {
    id: string;
    username: string;
    picture?: string; // profile picture url
}

export interface IUserParams {
    added_at: number; // in ms
    lang: Lang;
    token: string;
    tokenSecret: string;
    dmId?: string;
    dmToken?: string;
    dmTokenSecret?: string;
}

export interface IUserEgg extends ITwittoInfo, IUserParams {
    category?: UserCategory;
}

export interface IUser extends IUserEgg {
    followers: Array<IFollowerInfo & ITwittoInfo>;
    lastUnfollows: Array<IUnfollowerInfo & ITwittoInfo>;
}
