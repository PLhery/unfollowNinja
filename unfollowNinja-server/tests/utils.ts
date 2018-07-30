import { stub } from 'sinon';

export function redisMock() {
    return {
        set: jest.fn(),
        lpush: jest.fn(),
        zadd: jest.fn(),
        zrem: jest.fn(),
        zpush: jest.fn(),

        get: stub(),
        hget: stub(),
        hgetall: stub(),
        zcard: stub(),
        zrange: stub(),
        zscore: stub(),

        totalWriteCall() {
            return [this.set, this.lpush, this.zadd, this.zrem, this.zpush]
                .reduce((p, c) => p + c.mock.calls.length, 0);
        },
    };
}

export function queueMock() {
    return {
        create: jest.fn().mockReturnThis(),
        removeOnComplete: jest.fn().mockReturnThis(),
        save: jest.fn().mockImplementation((cb) => cb()),
        priority: jest.fn().mockReturnThis(),

        inactiveCount: stub(),
    };
}
