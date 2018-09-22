import { Job } from 'kue';
import CreateTwitterTasks from '../../src/tasks/createTwitterTasks';
import { daoMock, queueMock } from '../utils';

const queue = queueMock();
const dao = daoMock();
const job = new Job('createTwitterTasks');
// @ts-ignore
const task = new CreateTwitterTasks(dao, queue);

describe('createTwitterTasks task', () => {
    beforeEach(() => {
        queue.inactiveCount.mockImplementation((e, cb) => cb(null, 0));
        dao.getCachedUsername.mockResolvedValue('twitto');
        dao.userDao['01'].getHasNotCachedFollowers.mockResolvedValue(false);
        dao.userDao['02'].getHasNotCachedFollowers.mockResolvedValue(false);
        dao.userDao['03'].getHasNotCachedFollowers.mockResolvedValue(false);
    });

    test('3 followers & everything cached = 3 tasks', async () => {
        await task.run(job);
        expect(queue.save).toHaveBeenCalledTimes(3);
        expect(queue.create.mock.calls[0][1].userId).toBe('01');
        expect(queue.create.mock.calls[1][1].userId).toBe('02');
        expect(queue.create.mock.calls[2][1].userId).toBe('03');
    });

    test('3 followers & 2 people cached = 5 tasks', async () => {
        dao.userDao['01'].getHasNotCachedFollowers.mockResolvedValue(true);
        dao.userDao['03'].getHasNotCachedFollowers.mockResolvedValue(true);
        await task.run(job);
        expect(queue.save).toHaveBeenCalledTimes(5);
        expect(queue.create).toHaveBeenCalledWith('cacheFollowers', expect.any(Object));
        expect(queue.create).toHaveBeenCalledWith('checkFollowers', expect.any(Object));
    });

    test('too many inactive tasks = no task', async () => {
        queue.inactiveCount.mockImplementation((e, cb) => cb(null, 100));
        await task.run(job).catch((e: Error) => e); // ignore error
        expect(queue.save).toHaveBeenCalledTimes(0);
    });
});
