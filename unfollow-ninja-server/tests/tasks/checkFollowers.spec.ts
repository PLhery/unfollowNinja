import { Job } from 'kue';
import CheckFollowers from '../../src/tasks/checkFollowers';
import { daoMock, queueMock } from '../utils';

process.env.CONSUMER_KEY = 'consumerKey';
process.env.CONSUMER_SECRET = 'consumerSecret';

const queue = queueMock();
const dao = daoMock();
const userDao = dao.userDao['01'];
const job = new Job('checkFollowers', {username: 'testUsername', userId: '01'});
job.started_at = Date.now();
// @ts-ignore
const task = new CheckFollowers(dao, queue);

// reset time in sec (and not ms)
function mockTwitterReply(ids: string[], nextCursorStr = '0', remaining = '15', resetTime = '0', twit = userDao.twit) {
    twit.get.mockResolvedValueOnce({
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

describe('checkFollowers task', () => {
    beforeEach(() => {
        userDao.getFollowers.mockResolvedValue(['123', '234']);
    });

    test('no follow or unfollow no pagination', async () => {
        mockTwitterReply(['123', '234']);
        await task.run(job);
        expect(queue.save).toHaveBeenCalledTimes(0);
        expect(userDao.updateFollowers).toHaveBeenCalledTimes(0);
        expect(userDao.setNextCheckTime).toBeCalled();
    });

    test('two new followers', async () => {
        mockTwitterReply(['345', '456', '123', '234']);
        await task.run(job);
        expect(queue.save).toHaveBeenCalledTimes(0);
        expect(userDao.updateFollowers).toHaveBeenCalledTimes(1);
        expect(userDao.updateFollowers).toBeCalledWith(
            ['345', '456', '123', '234'], ['345', '456'], [], job.started_at,
        );
        expect(userDao.setNextCheckTime).toBeCalled();
    });

    test('two unfollowers', async () => {
        mockTwitterReply([]);
        await task.run(job);
        expect(queue.save).toHaveBeenCalledTimes(1);
        expect(queue.create).toBeCalledWith('notifyUser', expect.any(Object));

        expect(userDao.updateFollowers).toHaveBeenCalledTimes(1);
        expect(userDao.updateFollowers).toBeCalledWith(
            [], [], ['123', '234'], job.started_at,
        );
        expect(userDao.setNextCheckTime).toBeCalled();
    });

    test('new user - two new followers', async () => {
        userDao.getFollowers.mockResolvedValue(null);
        mockTwitterReply(['123', '234']);
        await task.run(job);
        expect(queue.save).toHaveBeenCalledTimes(0);
        expect(userDao.updateFollowers).toHaveBeenCalledTimes(1);
        expect(userDao.updateFollowers).toBeCalledWith(
            ['123', '234'], ['123', '234'], [], 0,
        );
        expect(userDao.setNextCheckTime).toBeCalled();
    });

    test('two new followers, two unfollowers', async () => {
        mockTwitterReply(['345', '456']);
        await task.run(job);
        expect(queue.save).toHaveBeenCalledTimes(1);

        expect(userDao.updateFollowers).toHaveBeenCalledTimes(1);
        expect(userDao.updateFollowers).toBeCalledWith(
            ['345', '456'], ['345', '456'], ['123', '234'], job.started_at,
        );
        expect(userDao.setNextCheckTime).toBeCalled();
    });

    test('three pages', async () => {
        mockTwitterReply(['123', '234'], '200');
        mockTwitterReply(['345', '456'], '100');
        mockTwitterReply(['567'], '0');
        await task.run(job);
        expect(queue.save).toHaveBeenCalledTimes(0);
        expect(userDao.updateFollowers).toBeCalledWith(
            ['123', '234', '345', '456', '567'], ['345', '456', '567'], [], job.started_at,
        );
        expect(userDao.setNextCheckTime).toHaveBeenCalledTimes(1);
    });

    test('skip the check if nextCheckTime is in the future', async () => {
        userDao.getNextCheckTime.mockResolvedValue(job.started_at as number + 5000);
        await task.run(job);
        expect(userDao.twit.get).toHaveBeenCalledTimes(0);
        expect(queue.save).toHaveBeenCalledTimes(0);
        expect(userDao.setNextCheckTime).toHaveBeenCalledTimes(0);
    });

    test('keep the check if nextCheckTime is in the past', async () => {
        userDao.getNextCheckTime.mockResolvedValue(job.started_at as number - 5000);
        mockTwitterReply(['123', '234']);
        await task.run(job);
        expect(userDao.twit.get).toHaveBeenCalledTimes(1);
        expect(queue.save).toHaveBeenCalledTimes(0);
        expect(userDao.setNextCheckTime).toHaveBeenCalledTimes(1);
    });

    test('If there are 3 pages, nextCheckTime is in 3 minutes', async () => {
        const resetTime = Math.floor(Number(job.started_at) / 1000 + 15 * 60);
        mockTwitterReply(['123', '234'], '200', '14', resetTime.toString());
        mockTwitterReply(['345', '456'], '100', '13', resetTime.toString());
        mockTwitterReply(['567'], '0', '12', resetTime.toString());
        await task.run(job);
        // should not be ok in 2 mins but ok in 3 mins
        expect(userDao.setNextCheckTime.mock.calls[0][0]).toBeGreaterThan(job.started_at as number + 2 * 60 * 1000);
        expect(userDao.setNextCheckTime.mock.calls[0][0]).toBeLessThan(job.started_at as number + 3 * 60 * 1000);
    });

    test('If there is 1 page, nextCheckTime is next minutes', async () => {
        const resetTime = Math.floor(Number(job.started_at) / 1000 + 15 * 60);
        mockTwitterReply(['123', '234'], '0', '14', resetTime.toString());
        await task.run(job);
        expect(userDao.setNextCheckTime.mock.calls[0][0]).toBeLessThan(Number(job.started_at) + 60 * 1000);
    });

    test('If there is no requests remaining (75 000+ followers), use DM tokens', async () => {
        const resetTime = Math.floor(Number(job.started_at) / 1000 + 15 * 60);
        mockTwitterReply(['123', '234'], '100', '0', resetTime.toString());
        mockTwitterReply(['345', '456'], '0', '0', resetTime.toString(), userDao.dmTwit);
        await task.run(job);
        expect(userDao.twit.get).toBeCalled();
        expect(userDao.dmTwit.get).toBeCalled();
    });

    test('If there is no requests remaining on any token, nextCheckTime is max(next reset times)', async () => {
        const resetTime1 = Math.floor(Number(job.started_at) / 1000 + 14 * 60);
        const resetTime2 = Math.floor(Number(job.started_at) / 1000 + 13 * 60);
        mockTwitterReply(['123', '234'], '100', '0', resetTime1.toString());
        mockTwitterReply(['345', '456'], '50', '0', resetTime2.toString(), userDao.dmTwit);
        await expect(task.run(job)).rejects.toThrowError('No twitter requests remaining to pursue the job.');
        expect(userDao.setNextCheckTime).toBeCalledWith(resetTime1 * 1000); // max(rt1,rt2)
    });
});
