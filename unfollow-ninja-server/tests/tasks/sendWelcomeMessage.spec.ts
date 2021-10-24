import type { Job } from 'bull';
import SendWelcomeMessage from '../../src/tasks/sendWelcomeMessage';
import { daoMock, queueMock } from '../utils';

process.env.CONSUMER_KEY = 'consumerKey';
process.env.CONSUMER_SECRET = 'consumerSecret';

const queue = queueMock();
const dao = daoMock();
const userDao = dao.userDao['01'];

const job = {
  data: {username: 'testUsername', userId: '01' },
  processedOn: Date.now(),
} as Job;

// @ts-ignore
const task = new SendWelcomeMessage(dao, queue);

describe('sendWelcomeMessage task', () => {
    beforeEach(() => {
        userDao.getLang.mockResolvedValue('en');
        userDao.dmTwit.post.mockResolvedValue(null);
    });

    test('send the welcome message', async () => {
        await task.run(job);
        expect(userDao.dmTwit.post).toHaveBeenCalledTimes(1);
        expect(userDao.dmTwit.post.mock.calls[0][1].event.message_create.message_data.text.startsWith('All set'))
            .toBe(true);
    });

    test('i18n', async () => {
        userDao.getLang.mockResolvedValue('fr');
        await task.run(job);
        expect(userDao.dmTwit.post.mock.calls[0][1].event.message_create.message_data.text.startsWith('Tout est prêt'))
            .toBe(true);
    });
});
