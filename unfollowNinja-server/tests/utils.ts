import { stub } from 'sinon';

export function redisMock() {
    return {
        set: jest.fn(),
        lpush: jest.fn(),
        zadd: jest.fn(),
        zrem: jest.fn(),
        zpush: jest.fn(),

        get: stub(),
        hgetall: stub(),
        zrange: stub(),
        zscore: stub(),
    };
}

export function queueMock() {
    return {
        create: jest.fn().mockReturnThis(),
        removeOnComplete: jest.fn().mockReturnThis(),
        save: jest.fn().mockImplementation((cb) => cb()),
    };
}
