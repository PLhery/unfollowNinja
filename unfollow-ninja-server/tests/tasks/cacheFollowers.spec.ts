import { Job } from 'kue';
import CacheFollowers from '../../src/tasks/cacheFollowers';
import { daoMock, queueMock } from '../utils';

process.env.CONSUMER_KEY = 'consumerKey';
process.env.CONSUMER_SECRET = 'consumerSecret';

const queue = queueMock();
const dao = daoMock();
const userDao = dao.userDao['01'];
const job = new Job('cacheFollowers', {username: 'testUsername', userId: '01'});
job.started_at = Date.now();
// @ts-ignore
const task = new CacheFollowers(dao, queue);

// reset time in sec (and not ms)
function mockTwitterReply(users: any[], nextCursorStr = '0', previousCursorStr = '0') {
    userDao.twit.get.mockResolvedValueOnce({
        data: {
            users,
            next_cursor_str: nextCursorStr,
            previous_cursor_str: previousCursorStr,
        },
    });
}

const user1 = {id_str: '123', profile_image_url_https: 'pic1', screen_name: 'user1'};
const user2 = {id_str: '234', profile_image_url_https: 'pic2', screen_name: 'user2'};
const user3 = {id_str: '345', profile_image_url_https: 'pic3', screen_name: 'user3'};

describe('cacheFollowers task', () => {
    beforeEach(() => {
        userDao.getFollowers.mockResolvedValue(['123', '234', '345']);
        userDao.getUncachableFollowers.mockResolvedValue([]);
    });

    test('every followers are already cached', async () => {
        userDao.getCachedFollowers.mockResolvedValue(['123', '234', '345']);
        await task.run(job);
        expect(userDao.getTwit).toHaveBeenCalledTimes(0);
        expect(userDao.setFollowerSnowflakeId).toHaveBeenCalledTimes(0);
        expect(userDao.addUncachableFollower).toHaveBeenCalledTimes(0);
    });

    test('last follower not cached', async () => {
        userDao.getCachedFollowers.mockResolvedValue(['234', '345']);
        mockTwitterReply([user1], '100');
        await task.run(job);
        expect(userDao.twit.get.mock.calls[0][1].cursor).toBe('-1');
        expect(dao.addTwittoToCache).toHaveBeenCalledTimes(1);
        expect(userDao.setFollowerSnowflakeId).toHaveBeenCalledTimes(1);
        expect(userDao.setFollowerSnowflakeId).toBeCalledWith('123', '100');
        expect(userDao.addUncachableFollower).toHaveBeenCalledTimes(0);
    });

    test('first follower not cached', async () => {
        userDao.getCachedFollowers.mockResolvedValue(['123', '234']);
        userDao.getFollowerSnowflakeId.mockResolvedValue('200');
        mockTwitterReply([user3], '0', '-300');
        await task.run(job);
        expect(userDao.getFollowerSnowflakeId.mock.calls[0][0]).toBe('234');
        expect(userDao.twit.get.mock.calls[0][1].cursor).toBe('200');
        expect(dao.addTwittoToCache).toHaveBeenCalledTimes(1);
        expect(userDao.setFollowerSnowflakeId).toHaveBeenCalledTimes(1);
        expect(userDao.setFollowerSnowflakeId).toBeCalledWith('345', '300');
        expect(userDao.addUncachableFollower).toHaveBeenCalledTimes(0);
    });

    test('no followers cached', async () => {
        userDao.getCachedFollowers.mockResolvedValue([]);
        mockTwitterReply([user1], '100');
        await task.run(job);
        expect(userDao.twit.get.mock.calls[0][1].cursor).toBe('-1');
        expect(dao.addTwittoToCache).toHaveBeenCalledTimes(1);
        expect(userDao.setFollowerSnowflakeId).toHaveBeenCalledTimes(1);
        expect(userDao.setFollowerSnowflakeId).toBeCalledWith('123', '100');
        expect(userDao.addUncachableFollower).toHaveBeenCalledTimes(0);
    });

    test('2 cached at a time (only last cached)', async () => {
        userDao.getCachedFollowers.mockResolvedValue(['123']);
        userDao.getFollowerSnowflakeId.mockResolvedValue('100');
        mockTwitterReply([user2, user3], '300', '-200');
        await task.run(job);
        expect(userDao.getFollowerSnowflakeId.mock.calls[0][0]).toBe('123');
        expect(userDao.twit.get.mock.calls[0][1].cursor).toBe('100');
        expect(dao.addTwittoToCache).toHaveBeenCalledTimes(2);
        expect(userDao.setFollowerSnowflakeId).toHaveBeenCalledTimes(2);
        expect(userDao.setFollowerSnowflakeId).toBeCalledWith('234', '200');
        expect(userDao.setFollowerSnowflakeId).toBeCalledWith('345', '300');
        expect(userDao.addUncachableFollower).toHaveBeenCalledTimes(0);
    });

    test('first follower is uncachable', async () => {
        userDao.getCachedFollowers.mockResolvedValue(['123', '234']);
        userDao.getFollowerSnowflakeId.mockResolvedValue('200');
        mockTwitterReply([], '0', '0');
        await task.run(job);
        expect(dao.addTwittoToCache).toHaveBeenCalledTimes(0);
        expect(userDao.setFollowerSnowflakeId).toHaveBeenCalledTimes(0);
        expect(userDao.addUncachableFollower).toHaveBeenCalledTimes(1);
        expect(userDao.addUncachableFollower).toBeCalledWith('345');
    });
});
