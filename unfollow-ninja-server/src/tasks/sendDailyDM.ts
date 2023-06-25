import i18n from 'i18n';
import type { Job } from 'bull';
import moment from 'moment-timezone';
import { UserCategory } from '../dao/dao';
import logger from '../utils/logger';
import { IUnfollowerInfo, Lang } from '../utils/types';
import Task from './task';
import metrics from '../utils/metrics';
import { NotificationEvent } from '../dao/userEventDao';
import { SUPPORTED_LANGUAGES } from '../utils/utils';
import { ApiResponseError } from 'twitter-api-v2';
import * as Sentry from '@sentry/node';

i18n.configure({
    locales: SUPPORTED_LANGUAGES,
    directory: __dirname + '/../../locales',
});

moment.tz.setDefault(process.env.TIMEZONE || 'UTC');

const TWITTER_ACCOUNT = process.env.TWITTER_ACCOUNT || 'unfollowninja';

export default class extends Task {
    public async run(job: Job) {
        let dmSentCount = 0;
        let dmAttemptCount = 0;
        let unfollowersCount = 0;
        let dmCheckedCount = 0;

        for (const userId of [
            ...(await this.dao.getUserIdsByCategory(UserCategory.vip)),
            ...(await this.dao.getUserIdsByCategory(UserCategory.enabled)),
        ]) {
            const userDao = this.dao.getUserDao(userId);
            const lastEventId = await userDao.getDmLastEventId();
            if (!lastEventId) {
                continue; // not enabled
            }
            const hasNewDmTwitterApi = await userDao.hasNewDmTwitterApi();
            if (!hasNewDmTwitterApi) {
                continue;
            }
            dmCheckedCount++;
            const username = await userDao.getUsername();
            const events = await this.dao.userEventDao.getFilteredUnfollowerEventsSinceId(userId, lastEventId, 250, 0);

            const alreadySeen = new Set<string>();
            const uniqueEvents = events
                .filter((event) => {
                    // Make sure there's only one line per person
                    const alreadyInThere = alreadySeen.has(event.followerId);
                    alreadySeen.add(event.followerId);
                    return !alreadyInThere;
                })
                .sort((a, b) =>
                    b.following === a.following
                        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                        : b.following
                        ? 1
                        : -1
                ); // sort by unfollow time, but put mutuals first

            const nbLeftover = Math.max(uniqueEvents.length - 30, 0);
            const unfollowers = await Promise.all(
                uniqueEvents.slice(0, 30).map(async (event) => ({
                    id: event.followerId,
                    username: await this.dao.getCachedUsername(event.followerId),
                    followTime: event.followTime * 1000,
                    unfollowTime: new Date(event.createdAt).getTime(),
                    blocking: event.blocking,
                    blocked_by: event.blockedBy,
                    suspended: event.suspended,
                    locked: event.locked,
                    deleted: event.deleted,
                    following: event.following,
                    followed_by: event.followedBy,
                    duration: moment(event.followTime * 1000).to(event.createdAt, true),
                }))
            );

            if (unfollowers.length > 0) {
                dmAttemptCount++;
                unfollowersCount += uniqueEvents.length;
                const message = this.generateMessage(unfollowers, 'en', nbLeftover);

                await this.dao.userEventDao.logNotificationEvent(
                    userId,
                    NotificationEvent.unfollowersMessage,
                    userId,
                    message
                );
                logger.info('sending a DM to @%s', username);
                await userDao
                    .getNewDmTwitterApi()
                    .then((dmClient) => dmClient.v2.sendDmToParticipant(userId, { text: message }))
                    .then(() => dmSentCount++)
                    .then(() => userDao.setUserParams({ dmLastEventId: events[0].id }))
                    .catch((err) => this.manageTwitterErrors(err, username, userId));
            }
        }
        metrics.gauge('sendDailyDm.checked', dmCheckedCount);
        metrics.gauge('sendDailyDm.sent', dmSentCount);
        metrics.gauge('sendDailyDm.attempt', dmAttemptCount);
        metrics.gauge('sendDailyDm.unfollowers', unfollowersCount);
        metrics.gauge('sendDailyDm.duration', Date.now() - job.processedOn);
    }

    private generateMessage(
        unfollowersInfo: Omit<IUnfollowerInfo, 'followDetectedTime'>[],
        lang: Lang,
        nbLeftovers
    ): string {
        i18n.setLocale(lang);
        const messages: string[] = unfollowersInfo.map((unfollower) => {
            let username = unfollower.username ? '@' + unfollower.username : i18n.__('one of your followers');

            let customEmoji = '';
            if (unfollower.username === 'louanben') {
                // https://twitter.com/louanben/status/1246045006529531910
                customEmoji = '\n👁👄👁';
                username += ' 👦🏽';
            }
            let action;
            if (unfollower.suspended) {
                const emoji = '🙈' + customEmoji;
                action = i18n.__('{{username}} has been suspended {{emoji}}.', {
                    username,
                    emoji,
                });
            } else if (unfollower.deleted) {
                const emoji = '🙈' + customEmoji;
                action = i18n.__('{{username}} has left Twitter {{emoji}}.', {
                    username,
                    emoji,
                });
            } else if (unfollower.blocked_by) {
                const emoji = '⛔️' + customEmoji;
                action = i18n.__('{{username}} blocked you {{emoji}}.', {
                    username,
                    emoji,
                });
            } else if (unfollower.blocking) {
                const emoji = '💩💩💩' + customEmoji;
                action = i18n.__('You blocked {{username}} {{emoji}}.', {
                    username,
                    emoji,
                });
            } else if (unfollower.locked) {
                const emoji = '🔒' + (unfollower.following ? customEmoji || '💔' : customEmoji);
                action = i18n.__("{{username}}'s account has been locked {{emoji}}.", {
                    username,
                    emoji,
                });
            } else if (unfollower.following) {
                const emoji = customEmoji || '💔';
                action = i18n.__('{{username}} unfollowed you {{emoji}}.', {
                    username,
                    emoji,
                });
            } else {
                const emoji = customEmoji || '👋';
                action = i18n.__('{{username}} unfollowed you {{emoji}}.', {
                    username,
                    emoji,
                });
            }

            let followTimeMsg;
            if (unfollower.followTime > 0) {
                const duration = moment(unfollower.followTime).locale(lang).to(unfollower.unfollowTime, true);
                const time = moment(unfollower.followTime).locale(lang).calendar();
                followTimeMsg = i18n.__('This account followed you for {{duration}} ({{{time}}}).', { duration, time });
            } else {
                followTimeMsg = i18n.__('This account followed you before you signed up to @{{twitterAccount}}!', {
                    twitterAccount: TWITTER_ACCOUNT,
                });
            }

            return action + '\n' + followTimeMsg;
        });

        if (messages.length === 1) {
            return messages[0];
        }
        const nbUnfollows = (messages.length + nbLeftovers).toString();
        let message = i18n.__('{{nbUnfollows}} Twitter users unfollowed you:', {
            nbUnfollows,
        });
        for (const unfollowerMessage of messages) {
            message += '\n  • ' + unfollowerMessage;
        }
        if (nbLeftovers > 0) {
            message +=
                '\n  • ' +
                i18n.__('and {{nbLeftovers}} more.', {
                    nbLeftovers: nbLeftovers.toString(),
                });
        }
        return message;
    }

    // throw an error if it's a twitter problem
    // return true if we can't continue to process the user
    private async manageTwitterErrors(err: unknown, username: string, userId: string): Promise<boolean> {
        if (!(err instanceof ApiResponseError)) {
            throw err;
        }

        // const userDao = this.dao.getUserDao(userId);
        let error;
        for (const { code, message } of [err]) {
            switch (code) {
                /* case 17: // no user matches the specified terms (users/lookup)
                case 50: // user not found (friendship/show)
                    break;
                // app-related
                case 32:
                    throw new Error(
                        'Authentication problems.' + 'Please check that your consumer key & secret are correct.'
                    );
                case 416:
                    throw new Error('Oops, it looks like the application has been suspended :/...');
                // user-related
                case 89:
                case 401: // since V2? but not clear message
                    logger.warn('@%s revoked the token. removing them from the list...', username);
                    await userDao.setCategory(UserCategory.revoked);
                    await sendRevokedEmailToUserId(userId);
                    return true;
                case 326:
                case 64:
                case 403: // since V2? but not clear message
                    logger.warn('@%s is suspended. removing them from the list...', username);
                    await userDao.setCategory(UserCategory.suspended);
                    return true;
                case 150: // dm closed to non-followers
                case 349: // user blocked?
                    logger.warn('@%s does not accept DMs. removing them from the list...', username);
                    await userDao.setCategory(UserCategory.dmclosed);
                    return true;
                case 292:
                    throw new Error('Notification blocked because "it seems automated".');
                // twitter errors
                case 130: // over capacity
                case 131: // internal error`
                    throw new Error('Twitter has problems at the moment, skipping this action.');
                case 88: // rate limit
                    throw new Error('the user reached its rate-limit (notifyUser)');*/
                default:
                    error = new Error(
                        `An unexpected twitter error occured: @${username}/${userId} - ${code} ${message} ${err.data.title} ${err.data.detail}`
                    );
                    logger.error(error);
                    Sentry.captureException(error);
            }
        }
        return false;
    }
}
