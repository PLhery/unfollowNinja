import type { UserCategory } from '../dao/dao';
import { SUPPORTED_LANGUAGES_CONST } from './utils';

export type Lang = typeof SUPPORTED_LANGUAGES_CONST[number];

export interface IFollowerInfo {
    id: string;
    followTime: number;
}

export interface IUnfollowerInfo extends IFollowerInfo {
    unfollowTime: number;
    followDetectedTime: number | null; // first time the system saw the follower
    blocking?: boolean;
    blocked_by?: boolean;
    suspended?: boolean;
    locked?: boolean;
    deleted?: boolean;
    following?: boolean;
    followed_by?: boolean;
    friendship_error_code?: number;
    notified_time?: number;
    username?: string;
    skippedBecauseGlitchy?: boolean;
}

export interface ITwittoInfo {
    id: string;
    username: string;
}

export interface IUserParams {
    added_at: number; // in ms
    lang: Lang;
    token: string;
    tokenSecret: string;
    isTemporarySecondAppToken?: boolean;
    dmId?: string;
    dmToken?: string;
    dmTokenSecret?: string;
    pro?: '3' | '2' | '1' | '0'; // friendcode-friends-pro-normal
    friendCodes?: string;
    customerId?: string;
}

export interface IUserEgg extends ITwittoInfo, IUserParams {
    category: UserCategory;
}

export interface Session {
    user?: IUserEgg & { dmUsername?: string };
}
