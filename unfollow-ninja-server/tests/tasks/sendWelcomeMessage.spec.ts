import type { Job } from 'bull';
import SendWelcomeMessage from '../../src/tasks/sendWelcomeMessage';
import { daoMock, queueMock } from '../utils';
import { NotificationEvent } from '../../src/dao/userEventDao';

process.env.CONSUMER_KEY = 'consumerKey';
process.env.CONSUMER_SECRET = 'consumerSecret';

const queue = queueMock();
const dao = daoMock();
const userDao = dao.userDao['01'];

const job = {
    data: { username: 'testUsername', userId: '01' },
    processedOn: Date.now(),
} as Job;

const task = new SendWelcomeMessage(dao, queue);

describe('sendWelcomeMessage task', () => {
    beforeEach(() => {
        userDao.getLang.mockResolvedValue('en');
        userDao.dmTwit.post.mockResolvedValue(null);
    });

    test('send the welcome message', async () => {
        await task.run(job);
        expect(userDao.dmTwit.post).toHaveBeenCalledTimes(1);
        expect(userDao.dmTwit.post.mock.calls[0][1].event.message_create.message_data.text.startsWith('All set')).toBe(
            true
        );
        expect(dao.userEventDao.logNotificationEvent).toHaveBeenCalledTimes(1);
        expect(dao.userEventDao.logNotificationEvent).toHaveBeenCalledWith(
            '01',
            NotificationEvent.welcomeMessage,
            'user0',
            'All set, welcome to @unfollowninja 🙌!\nYou will soon know all about your unfollowers here!'
        );
    });

    test('i18n', async () => {
        userDao.getLang.mockResolvedValue('fr');
        await task.run(job);
        expect(
            userDao.dmTwit.post.mock.calls[0][1].event.message_create.message_data.text.startsWith('Tout est prêt')
        ).toBe(true);
    });
});
