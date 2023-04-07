import type { Queue } from 'bull';
import type Dao from '../src/dao/dao';

export function userDaoMock() {
    const twit = twitterApiMock();
    const dmTwit = twitterApiMock();
    return {
        twit,
        dmTwit,
        getTwitterApi: jest.fn().mockResolvedValue(twit),
        getDmTwitterApi: jest.fn().mockResolvedValue(dmTwit),
        getLang: jest.fn(),
        getDmId: jest.fn().mockResolvedValue('user0'),
        getUsername: jest.fn(),

        setNextCheckTime: jest.fn(),
        updateFollowers: jest.fn(),
        setFollowerSnowflakeId: jest.fn(),
        addUncachableFollower: jest.fn(),

        getNextCheckTime: jest.fn(),
        getFollowers: jest.fn(),
        getFollowerSnowflakeId: jest.fn(),
        getFollowTime: jest.fn(),
        getHasNotCachedFollowers: jest.fn(),
        getCachedFollowers: jest.fn(),
        getUncachableFollowers: jest.fn(),
        getFollowDetectedTime: jest.fn(),
    };
}

function _daoMock() {
    const userDao = {
        '01': userDaoMock(),
        '02': userDaoMock(),
        '03': userDaoMock(),
    };
    return {
        userDao,
        getUserDao: jest.fn().mockImplementation((id: '01' | '02' | '03') => userDao[id]),
        userEventDao: {
            logNotificationEvent: jest.fn(),
            logUnfollowerEvent: jest.fn(),
        },
        addTwittoToCache: jest.fn(),
        getUserIdsByCategory: jest.fn().mockResolvedValue(['01', '02', '03']),
        getUserCountByCategory: jest.fn().mockResolvedValue({}),
        getCachedUsername: jest.fn(),
    };
}

export function daoMock() {
    return _daoMock() as ReturnType<typeof _daoMock> & Dao;
}

export function queueMock() {
    return {
        add: jest.fn().mockResolvedValue({}),
    } as object as Queue;
}

interface DmSendParams {
    event: { message_create: { message_data: { text: string } } };
}

export function twitterApiMock() {
    return {
        v2: {
            get: jest.fn(),
            sendDmToParticipant: jest.fn(),
        },
    };
}
