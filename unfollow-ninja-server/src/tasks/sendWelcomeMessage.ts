import * as i18n from 'i18n';
import type { Job } from 'bull';
import {Params, Twitter} from 'twit';
import {UserCategory} from '../dao/dao';
import logger from '../utils/logger';
import Task from './task';
import { NotificationEvent } from '../dao/userEventDao';

i18n.configure({
    locales: ['en', 'fr', 'es', 'pt', 'id'],
    directory: __dirname + '/../../locales',
});

const TWITTER_ACCOUNT = process.env.TWITTER_ACCOUNT || 'unfollowninja';

export default class extends Task {
    public async run(job: Job) {
        const { username, userId } = job.data;
        const userDao = this.dao.getUserDao(userId);
        const dmTwit = await userDao.getDmTwit();
        i18n.setLocale(await userDao.getLang());

        const message = i18n.__('All set, welcome to @{{twitterAccount}} {{emoji}}!\n' +
            'You will soon know all about your unfollowers here!',
          { twitterAccount: TWITTER_ACCOUNT, emoji: '🙌' }
        );

      this.dao.userEventDao
        .logNotificationEvent(userId, NotificationEvent.welcomeMessage, await userDao.getDmId(), message);

        await dmTwit.post('direct_messages/events/new', {
            event: {
                type: 'message_create',
                message_create: {target: {recipient_id: userId}, message_data: {text: message}},
            },
        } as Params)
            .catch((err) => this.manageTwitterErrors(err, username, userId));
    }

    private async manageTwitterErrors(err: any, username: string, userId: string): Promise<void> {

        if (!err.twitterReply) {
            throw err;
        }
        const twitterReply: Twitter.Errors = err.twitterReply;

        const userDao = this.dao.getUserDao(userId);

        for (const { code, message } of twitterReply.errors) {
            switch (code) {
                // app-related
                case 32:
                    throw new Error('Authentication problems.' +
                        'Please check that your consumer key & secret are correct.');
                case 416:
                    throw new Error('Oops, it looks like the application has been suspended :/...');
                // user-related
                case 89:
                    logger.warn('@%s revoked the token. removing them from the list...', username);
                    await userDao.setCategory(UserCategory.revoked);
                    break;
                case 326:
                case 64:
                    logger.warn('@%s is suspended. removing them from the list...', username);
                    await userDao.setCategory(UserCategory.suspended);
                    break;
                // twitter errors
                case 130: // over capacity
                case 130: // over capacity
                case 131: // internal error`
                case 88: // rate limit
                    // retry in 15 minutes
                    await this.queue.add('sendWelcomeMessage', {
                        userId,
                        username,
                    }, {delay: 15 * 60 * 1000});
                    break;
                default:
                    throw new Error(`An unexpected twitter error occured: ${code} ${message}`);
            }
        }
    }
}
