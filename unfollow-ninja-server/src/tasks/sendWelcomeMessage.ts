import * as i18n from 'i18n';
import type { Job } from 'bull';
import { UserCategory } from '../dao/dao';
import logger from '../utils/logger';
import Task from './task';
import { NotificationEvent } from '../dao/userEventDao';
import { SUPPORTED_LANGUAGES } from '../utils/utils';
import { ApiResponseError } from 'twitter-api-v2';
import { sendRevokedEmailToUserId } from '../utils/emailSender';
import UserDao from '../dao/userDao';

i18n.configure({
    locales: SUPPORTED_LANGUAGES,
    directory: __dirname + '/../../locales',
});

const TWITTER_ACCOUNT = process.env.TWITTER_ACCOUNT || 'unfollowninja';

export default class extends Task {
    public async run(job: Job) {
        const { username, userId, isPro, lostPro } = job.data;
        const userDao = this.dao.getUserDao(userId);
        // const dmTwitterApi = await userDao.getDmTwitterApi();
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

        /* await dmTwitterApi.v2
            .sendDmToParticipant(userId, { text: message })
            .catch((err) => this.manageTwitterErrors(err, username, userId)); */
    }

    private async manageTwitterErrors(err: ApiResponseError, userDao: UserDao, userId: string): Promise<void> {
        switch (err?.data?.detail) {
            case 'Unauthorized': // since V2? but not clear message
                logger.warn('@%s revoked the token. Removing them from the list...', await userDao.getUsername());
                await userDao.setCategory(UserCategory.revoked);
                await sendRevokedEmailToUserId(userId);
                break;
            case 'Forbidden': // since V2? but not clear message
                logger.warn('@%s is suspended. Removing them from the list...', await userDao.getUsername());
                await userDao.setCategory(UserCategory.suspended);
                break;
            default:
                throw new Error(
                    `[checkFollowers] An unexpected twitter error occured: ${err?.code} ${err?.message} ${err?.data?.title} ${err?.data?.detail}`
                );
        }
    }
}
