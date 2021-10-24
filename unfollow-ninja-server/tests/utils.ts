export function userDaoMock() {
    const twit = twitMock();
    const dmTwit = twitMock();
    return {
        twit,
        dmTwit,
        getTwit: jest.fn().mockResolvedValue(twit),
        getDmTwit: jest.fn().mockResolvedValue(dmTwit),
        getLang: jest.fn(),
        getUsername: jest.fn(),

        setNextCheckTime: jest.fn(),
        updateFollowers: jest.fn(),
        setFollowerSnowflakeId: jest.fn(),
        addUnfollowers: jest.fn(),
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

export function daoMock() {
    const userDao = { '01': userDaoMock(), '02': userDaoMock(), '03': userDaoMock() };
    return {
        userDao,
        getUserDao: jest.fn().mockImplementation((id: '01'|'02'|'03') => userDao[id]),

        addTwittoToCache: jest.fn(),

        getUserIdsByCategory: jest.fn().mockResolvedValue(['01', '02', '03']),
        getUserCountByCategory: jest.fn().mockResolvedValue({}),
        getCachedUsername: jest.fn(),
    };
}

export function queueMock() {
    return {
        add: jest.fn().mockResolvedValue({}),
    };
}

export function twitMock() {
    return {
        get: jest.fn(),
        post: jest.fn(),
    };
}
