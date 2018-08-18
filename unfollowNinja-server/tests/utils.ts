export function userDaoMock() {
    const twit = twitMock();
    const dmTwit = twitMock();
    return {
        twit,
        dmTwit,
        getTwit: jest.fn().mockResolvedValue(twit),
        getDmTwit: jest.fn().mockResolvedValue(dmTwit),
        getLang: jest.fn(),

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
    };
}

export function daoMock() {
    const userDao = { '01': userDaoMock(), '02': userDaoMock(), '03': userDaoMock() };
    return {
        userDao,
        getUserDao: jest.fn().mockImplementation((id: '01'|'02'|'03') => userDao[id]),

        addTwittoToCache: jest.fn(),

        getUserIdsByCategory: jest.fn().mockResolvedValue(['01', '02', '03']),
        getCachedUsername: jest.fn()
    };
}

export function queueMock() {
    return {
        create: jest.fn().mockReturnThis(),
        removeOnComplete: jest.fn().mockReturnThis(),
        save: jest.fn().mockImplementation((cb) => cb()),
        priority: jest.fn().mockReturnThis(),

        inactiveCount: jest.fn(),
    };
}

export function twitMock() {
    return {
        get: jest.fn(),
        post: jest.fn(),
    };
}