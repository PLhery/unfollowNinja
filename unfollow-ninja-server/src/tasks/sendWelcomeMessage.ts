import * as i18n from 'i18n';
import type { Job } from 'bull';
import { UserCategory } from '../dao/dao';
import logger from '../utils/logger';
import Task from './task';
import { NotificationEvent } from '../dao/userEventDao';
import { SUPPORTED_LANGUAGES } from '../utils/utils';
import { ApiResponseError } from 'twitter-api-v2';

i18n.configure({
    locales: SUPPORTED_LANGUAGES,
    directory: __dirname + '/../../locales',
});

const TWITTER_ACCOUNT = process.env.TWITTER_ACCOUNT || 'unfollowninja';

export default class extends Task {
    public async run(job: Job) {
        const { username, userId, isPro, lostPro } = job.data;
        const userDao = this.dao.getUserDao(userId);
        const dmTwitterApi = await userDao.getDmTwitterApi();
        i18n.setLocale(await userDao.getLang());

        let message;
        if (isPro) {
            message = i18n.__('Congratulations, can now enjoy @{{twitterAccount}} pro {{emoji}}!', {
                twitterAccount: TWITTER_ACCOUNT,
                emoji: '🚀',
            });
        } else if (lostPro) {
            message = i18n.__(
                "Your @{{twitterAccount}} pro subscription has ended, thank you for being a part of our community, we hope we'll see you again {{emoji}}!",
                {
                    twitterAccount: TWITTER_ACCOUNT,
                    emoji: '🙏',
                }
            );
        } else {
            message = i18n.__(
                'All set, welcome to @{{twitterAccount}} {{emoji}}!\n' +
                    'You will soon know all about your unfollowers here!',
                { twitterAccount: TWITTER_ACCOUNT, emoji: '🙌' }
            );
        }

        await this.dao.userEventDao.logNotificationEvent(
            userId,
            NotificationEvent.welcomeMessage,
            await userDao.getDmId(),
            message
        );

        await dmTwitterApi.v2
            .sendDmToParticipant(userId, { text: message })
            .catch((err) => this.manageTwitterErrors(err, username, userId));
    }

    private async manageTwitterErrors(err: unknown, username: string, userId: string): Promise<void> {
        if (!(err instanceof ApiResponseError)) {
            throw err;
        }

        const userDao = this.dao.getUserDao(userId);

        for (const { code, message } of [err]) {
            switch (code) {
                // app-related
                case 32:
                    throw new Error(
                        'Authentication problems.' + 'Please check that your consumer key & secret are correct.'
                    );
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
                case 131: // internal error`
                case 88: // rate limit
                    // retry in 15 minutes
                    await this.queue.add(
                        'sendWelcomeMessage',
                        {
                            id: Date.now(), // otherwise some seem stuck??
                            userId,
                            username,
                        },
                        { delay: 15 * 60 * 1000 }
                    );
                    break;
                default:
                    throw new Error(
                        `An unexpected twitter error occured: ${code} ${message} ${err.data.title} ${err.data.detail}`
                    );
            }
        }
    }
}
