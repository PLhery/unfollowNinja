import { UserCategory } from '../dao/dao';

export interface IFollowerInfo {
    id: string;
    followTime: number;
}

export interface IUnfollowerInfo extends IFollowerInfo {
    unfollowTime: number;
}

export interface ITwittoInfo {
    id: string;
    username: string;
    picture: string; // profile picture url
}

export interface IUserParams {
    added_at: number; // in ms
    lang: 'fr' | 'en';
    token: string;
    tokenSecret: string;
}

export interface IUserEgg extends ITwittoInfo, IUserParams {
    category?: UserCategory;
}

export interface IUser extends IUserEgg {
    followers: Array<IFollowerInfo & ITwittoInfo>;
    lastUnfollows: Array<IUnfollowerInfo & ITwittoInfo>;
}
