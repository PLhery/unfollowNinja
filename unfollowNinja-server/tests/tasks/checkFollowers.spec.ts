import { Job } from 'kue';
import * as Twit from 'twit';
import CheckFollowers from '../../src/tasks/checkFollowers';
import { queueMock, redisMock } from '../utils';

process.env.CONSUMER_KEY = 'consumerKey';
process.env.CONSUMER_SECRET = 'consumerSecret';

jest.mock('twit');

const queue = queueMock();
const redis = redisMock();
const job = new Job('checkFollowers', {username: 'testUsername', userId: '1234'});
job.started_at = Date.now().toString();
// @ts-ignore
const task = new CheckFollowers(redis, queue);

// reset time in sec (and not ms)
function mockTwitterReply(ids: string[], nextCursorStr = '0', remaining = '15', resetTime = '0') {
    // @ts-ignore
    Twit.prototype.get.mockResolvedValueOnce({
        data: {
            ids,
            next_cursor_str: nextCursorStr,
        },
        resp: {
            headers: {
                'x-rate-limit-remaining': remaining,
                'x-rate-limit-reset': resetTime,
            },
        },
    });
}

const anyString = expect.any(String);

describe('checkFollowers task', () => {
    beforeEach(() => {
        redis.get.reset();
        redis.hgetall.withArgs('user:1234').returns({token: 'token', tokenSecret: 'secret'});
        redis.zrange.withArgs('followers:1234').returns(['123', '234']);
        // @ts-ignore
        Twit.prototype.get.mockReset();
    });

    test('no follow or unfollow no pagination', async () => {
        mockTwitterReply(['123', '234']);
        await task.run(job);
        expect(queue.save).toHaveBeenCalledTimes(0);
        expect(redis.totalWriteCall()).toBe(1)
        expect(redis.set).toHaveBeenCalledWith('nextCheckTime:1234', anyString);
    });

    test('two new followers', async () => {
        mockTwitterReply(['345', '456', '123', '234']);
        await task.run(job);
        expect(queue.save).toHaveBeenCalledTimes(0);
        expect(redis.totalWriteCall()).toBe(3);
        expect(redis.set).toHaveBeenCalledWith('nextCheckTime:1234', anyString);
        expect(redis.zadd).toBeCalledWith('followers:1234', '0', '345', '0', '456');
        expect(redis.zadd).toBeCalledWith('followers:not-cached:1234', job.started_at, '345', job.started_at, '456');
    });

    test('two unfollowers', async () => {
        mockTwitterReply([]);
        await task.run(job);
        expect(queue.save).toHaveBeenCalledTimes(1);
        expect(queue.create).toBeCalledWith('notifyUser', expect.any(Object));
        expect(redis.totalWriteCall()).toBe(4);
        expect(redis.set).toHaveBeenCalledWith('nextCheckTime:1234', anyString);
        expect(redis.zrem).toBeCalledWith('followers:1234', '123', '234');
        expect(redis.zrem).toBeCalledWith('followers:not-cached:1234', '123', '234');
        expect(redis.lpush).toBeCalledWith('unfollowers:1234', anyString, anyString);
    });

    test('two new followers, two unfollowers', async () => {
        mockTwitterReply(['345', '456']);
        await task.run(job);
        expect(queue.save).toHaveBeenCalledTimes(1);
        expect(redis.totalWriteCall()).toBe(6);
    });

    test('three pages', async () => {
        mockTwitterReply(['123', '234'], '200');
        mockTwitterReply(['345', '456'], '100');
        mockTwitterReply(['567'], '0');
        await task.run(job);
        expect(queue.save).toHaveBeenCalledTimes(0);
        expect(redis.totalWriteCall()).toBe(3);
        expect(redis.zadd).toBeCalledWith('followers:1234', '0', '345', '0', '456', '0', '567');
    });

    test('skip the check if nextCheckTime is in the future', async () => {
        redis.get.withArgs('nextCheckTime:1234').returns((Number(job.started_at) + 5000).toString());
        await task.run(job);
        expect(Twit.prototype.get).toHaveBeenCalledTimes(0);
        expect(queue.save).toHaveBeenCalledTimes(0);
        expect(redis.totalWriteCall()).toBe(0);
    });

    test('keep the check if nextCheckTime is in the past', async () => {
        redis.get.withArgs('nextCheckTime:1234').returns((Number(job.started_at) - 5000).toString());
        mockTwitterReply(['123', '234']);
        await task.run(job);
        expect(Twit.prototype.get).toHaveBeenCalledTimes(1);
        expect(queue.save).toHaveBeenCalledTimes(0);
        expect(redis.totalWriteCall()).toBe(1);
    });

    test('If there are 3 pages, nextCheckTime is in 3 minutes', async () => {
        const resetTime = Math.floor(Number(job.started_at) / 1000 + 15 * 60);
        mockTwitterReply(['123', '234'], '200', '14', resetTime.toString());
        mockTwitterReply(['345', '456'], '100', '13', resetTime.toString());
        mockTwitterReply(['567'], '0', '12', resetTime.toString());
        await task.run(job);
        expect(redis.set.mock.calls[0][0]).toBe('nextCheckTime:1234');
        // should not be ok in 2 mins but ok in 3 mins
        expect(Number(redis.set.mock.calls[0][1])).toBeGreaterThan(Number(job.started_at) + 2 * 60 * 1000);
        expect(Number(redis.set.mock.calls[0][1])).toBeLessThan(Number(job.started_at) + 3 * 60 * 1000);
    });

    test('If there is 1 page, nextCheckTime is next minutes', async () => {
        const resetTime = Math.floor(Number(job.started_at) / 1000 + 15 * 60);
        mockTwitterReply(['123', '234'], '0', '14', resetTime.toString());
        await task.run(job);
        expect(redis.set.mock.calls[0][0]).toBe('nextCheckTime:1234');
        expect(Number(redis.set.mock.calls[0][1])).toBeLessThan(Number(job.started_at) + 60 * 1000);
    });

    test('If there is no requests remaining, nextCheckTime is next reset time', async () => {
        const resetTime = Math.floor(Number(job.started_at) / 1000 + 15 * 60);
        mockTwitterReply(['123', '234'], '0', '0', resetTime.toString());
        await task.run(job);
        expect(redis.set).toBeCalledWith('nextCheckTime:1234', (resetTime * 1000).toString());
    });
});
