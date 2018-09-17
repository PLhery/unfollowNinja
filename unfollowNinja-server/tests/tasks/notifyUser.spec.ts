import { Job } from 'kue';
import NotifyUser from '../../src/tasks/notifyUser';
import { IUnfollowerInfo } from '../../src/utils/types';
import { daoMock, queueMock } from '../utils';

process.env.CONSUMER_KEY = 'consumerKey';
process.env.CONSUMER_SECRET = 'consumerSecret';

const queue = queueMock();
const dao = daoMock();
const userDao = dao.userDao['01'];
const unfollowersInfo: IUnfollowerInfo[] = [];
const job = new Job('notifyUser', {username: 'testUsername', userId: '01', unfollowersInfo });
job.started_at = Date.now();
// @ts-ignore
const task = new NotifyUser(dao, queue);

function mockUsersLookupReply(ids: string[], screenNames: string[]) {
    userDao.twit.post.mockResolvedValueOnce({
        data: screenNames.map((screenName, i) => ({ id_str: ids[i], screen_name: screenName })),
    });
}

function mockFriendshipShowReply(blocking = false,
                                 blockedBy = false,
                                 following = false,
                                 followedBy = false,
                                 id: string = null,
                                 screenName: string = null) {
    userDao.twit.get.mockResolvedValueOnce({
        data: {
            relationship: {
                source: {
                    blocking,
                    blocked_by: blockedBy,
                    following,
                    followed_by: followedBy,
                },
                target: {
                    id_str: id,
                    screen_name: screenName,
                },
            },
        },
    });
}

function mockFriendshipShowReplyNotFound() {
    userDao.twit.get.mockRejectedValueOnce({twitterReply: {errors: [{code: 50}]}});
}

describe('notifyUser task', () => {
    beforeEach(() => {
        unfollowersInfo.splice(0); // empty array
        userDao.getLang.mockResolvedValue('en');
        userDao.dmTwit.post.mockResolvedValue(null);
        userDao.getFollowDetectedTime.mockResolvedValue(0);
    });

    test('one classic unfollower', async () => {
        unfollowersInfo.push({id: '123', followTime: 100, followDetectedTime: 100, unfollowTime: 2000000});
        mockUsersLookupReply(['123'], ['twitto123']);
        mockFriendshipShowReply();
        await task.run(job);
        expect(queue.save).toHaveBeenCalledTimes(0);
        expect(userDao.addUnfollowers).toHaveBeenCalledTimes(1);
        expect(userDao.dmTwit.post).toHaveBeenCalledTimes(1);
        expect(userDao.dmTwit.post.mock.calls[0][1].event.message_create.message_data.text)
            .toBe('@twitto123 unfollowed you 👋.\n' +
            'This account followed you for 33 minutes (01/01/1970).');
    });

    test('two unfollowers', async () => {
        unfollowersInfo.push({id: '123', followTime: 100, followDetectedTime: 100, unfollowTime: 2000000});
        unfollowersInfo.push({id: '234', followTime: 0, followDetectedTime: 0, unfollowTime: 2000000});
        mockUsersLookupReply(['123', '234'], ['twitto123', 'twitto234']);
        mockFriendshipShowReply();
        mockFriendshipShowReply();
        await task.run(job);
        expect(queue.save).toHaveBeenCalledTimes(0);
        expect(userDao.addUnfollowers).toHaveBeenCalledTimes(1);
        expect(userDao.dmTwit.post).toHaveBeenCalledTimes(1);
        expect(userDao.dmTwit.post.mock.calls[0][1].event.message_create.message_data.text)
            .toBe('2 twitter users unfollowed you:\n' +
                '  • @twitto123 unfollowed you 👋.\n' +
                'This account followed you for 33 minutes (01/01/1970).\n' +
                '  • @twitto234 unfollowed you 👋.\n' +
                'This account followed you before you signed up to @unfollowninja!');
    });

    test('one unfollower, one twitter glitch (followed_by=true)', async () => {
        unfollowersInfo.push({id: '123', followTime: 100, followDetectedTime: 100, unfollowTime: 2000000});
        unfollowersInfo.push({id: '234', followTime: 200, followDetectedTime: 200, unfollowTime: 2000000});
        mockUsersLookupReply(['123'], ['twitto123']);
        mockFriendshipShowReply();
        mockFriendshipShowReply(false, false, false, true, 'twitto234');
        await task.run(job);
        expect(userDao.addUnfollowers).toHaveBeenCalledTimes(1);
        expect(userDao.dmTwit.post).toHaveBeenCalledTimes(1);
        expect(userDao.dmTwit.post.mock.calls[0][1].event.message_create.message_data.text)
            .toBe('@twitto123 unfollowed you 👋.\n' +
                'This account followed you for 33 minutes (01/01/1970).');
    });

    test('one unfollower, one potential twitter glitch (user not found)', async () => {
        unfollowersInfo.push({id: '123', followTime: 100, followDetectedTime: 100, unfollowTime: 2000000});
        unfollowersInfo.push({id: '234', followTime: 200, followDetectedTime: 200, unfollowTime: 2000000000});
        mockUsersLookupReply(['123'], ['twitto123']);
        mockFriendshipShowReply();
        mockFriendshipShowReplyNotFound();
        await task.run(job);
        expect(queue.save).toHaveBeenCalledTimes(1);
        expect(userDao.addUnfollowers).toHaveBeenCalledTimes(1);
        expect(userDao.dmTwit.post).toHaveBeenCalledTimes(1);
        expect(userDao.dmTwit.post.mock.calls[0][1].event.message_create.message_data.text)
            .toBe('@twitto123 unfollowed you 👋.\n' +
                'This account followed you for 33 minutes (01/01/1970).');
    });

    test('one unfollower, one potential twitter glitch, second try', async () => {
        unfollowersInfo.push({id: '123', followTime: 100, followDetectedTime: 100, unfollowTime: 2000000});
        unfollowersInfo.push({id: '234', followTime: 200, followDetectedTime: 200, unfollowTime: 2000000000});
        mockUsersLookupReply(['123'], ['twitto123']);
        mockFriendshipShowReply();
        mockFriendshipShowReply(false, false, false, true, 'twitto234');
        job.data.isSecondTry = true;
        await task.run(job);
        job.data.isSecondTry = false;
        expect(queue.save).toHaveBeenCalledTimes(0);
        expect(userDao.addUnfollowers).toHaveBeenCalledTimes(1);
        expect(userDao.dmTwit.post).toHaveBeenCalledTimes(1);
    });

    test('one unfollower, one suspended', async () => {
        unfollowersInfo.push({id: '123', followTime: 100, followDetectedTime: 100, unfollowTime: 2000000});
        unfollowersInfo.push({id: '234', followTime: 200, followDetectedTime: 200, unfollowTime: 2000000});
        mockUsersLookupReply(['123'], ['twitto123']);
        mockFriendshipShowReply();
        mockFriendshipShowReply();
        dao.getCachedUsername.mockResolvedValue('twitto234');
        await task.run(job);
        expect(queue.save).toHaveBeenCalledTimes(0);
        expect(userDao.addUnfollowers).toHaveBeenCalledTimes(1);
        expect(userDao.dmTwit.post).toHaveBeenCalledTimes(1);
        expect(userDao.dmTwit.post.mock.calls[0][1].event.message_create.message_data.text)
            .toBe('2 twitter users unfollowed you:\n' +
                '  • @twitto123 unfollowed you 👋.\n' +
                'This account followed you for 33 minutes (01/01/1970).\n' +
                '  • @twitto234 has been suspended 🙈.\n' +
                'This account followed you for 33 minutes (01/01/1970).');
    });

    test('i18n', async () => {
        userDao.getLang.mockResolvedValue('fr');
        unfollowersInfo.push({id: '123', followTime: 100, followDetectedTime: 100, unfollowTime: 2000000});
        mockUsersLookupReply(['123'], ['twitto123']);
        mockFriendshipShowReply();
        await task.run(job);
        expect(userDao.dmTwit.post.mock.calls[0][1].event.message_create.message_data.text)
            .toBe('@twitto123 vous a unfollow 👋.\n' +
                'Ce compte vous a suivi pendant 33 minutes (01/01/1970).');
    });
});
