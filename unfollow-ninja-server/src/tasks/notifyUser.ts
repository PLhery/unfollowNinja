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
import { ApiResponseError, UsersV2Result } from 'twitter-api-v2';

i18n.configure({
    locales: SUPPORTED_LANGUAGES,
    directory: __dirname + '/../../locales',
});

moment.tz.setDefault(process.env.TIMEZONE || 'UTC');

const MINUTES_BETWEEN_CHECKS = Number(process.env.MINUTES_BETWEEN_CHECKS) || 2;
const TWITTER_ACCOUNT = process.env.TWITTER_ACCOUNT || 'unfollowninja';

// friendships/show can be called 180 times/15min
// with this limit it can be called max 200 times/15min (if checked 8 times)
const MAX_UNFOLLOWERS = 25;

export default class extends Task {
    public async run(job: Job) {
        const { userId, isSecondTry } = job.data;
        const userDao = this.dao.getUserDao(userId);
        const username = await userDao.getUsername();

        const twitterApi = await userDao.getTwitterApi();
        const unfollowersInfo: IUnfollowerInfo[] = job.data.unfollowersInfo;
        const unfollowersMap = new Map(unfollowersInfo.map((info) => [info.id, info]));
        let stopThere = false;

        // get the list of (3000 first) following to check whether there were some mutuals, priorise them
        await twitterApi.v2
            .following(userId, { max_results: 1000, asPaginator: true })
            .then((result) => (!result.done ? result.fetchNext(1000) : result))
            .then((result) => (!result.done ? result.fetchNext(1000) : result))
            .then((followings) => {
                followings.users.forEach((following) => {
                    const unfollowerInfo = unfollowersMap.get(following.id);
                    if (unfollowerInfo) {
                        unfollowerInfo.following = true;
                        // move to top
                        unfollowersInfo.unshift(
                            // move to the top
                            unfollowersInfo.splice(
                                // the removed element that is unfollowerInfo
                                unfollowersInfo.indexOf(unfollowerInfo),
                                1
                            )[0]
                        );
                    }
                });
            })
            .catch(async (err) => {
                if (err instanceof ApiResponseError && err.code === 429) {
                    logger.debug('Too many requests, will ignore getFollowing');
                    return;
                }
                await this.manageTwitterErrors(err, username, userId).then((stop) =>
                    stop ? (stopThere = true) : { data: [] }
                );
            });
        if (stopThere) {
            return;
        }

        // splice as we won't get every username and info
        const leftovers = unfollowersInfo.splice(MAX_UNFOLLOWERS);

        unfollowersInfo.forEach((u) => (u.suspended = true));

        // cache twittos and know who's suspended
        const usersLookup = (await twitterApi.v2
            .users(
                unfollowersInfo.map((u) => u.id),
                { 'user.fields': ['public_metrics', 'protected'] }
            )
            .catch((err) =>
                this.manageTwitterErrors(err, username, userId).then((stop) =>
                    stop ? (stopThere = true) : { data: [] }
                )
            )) as UsersV2Result;

        if (stopThere) {
            return;
        }

        // check who is (probably) locked ; get the latest username
        if (usersLookup.data) {
            usersLookup.data.forEach((user) => {
                const unfollowerInfo = unfollowersMap.get(user.id);
                unfollowerInfo.suspended = false;
                unfollowerInfo.locked = user.public_metrics.following_count === 0;
                unfollowerInfo.username = user.username;
                unfollowerInfo.protected = user.protected;
            });
        }

        // know who blocked you, is deleted, is suspended etc
        await Promise.all(
            unfollowersInfo
                .filter((unfollower) => !unfollower.protected) // otherwise we know we'll get Authorization Error
                .map(async (unfollower) => {
                    try {
                        const fResult = await twitterApi.v2.following(unfollower.id, { max_results: 1 });
                        unfollower.suspended = false;
                        if (fResult.errors) {
                            if (fResult.errors[0].title === 'Authorization Error') {
                                unfollower.blocked_by = true;
                            } else if (fResult.errors[0].title === 'Not Found Error') {
                                unfollower.deleted = true;
                            } else if (fResult.errors[0].title === 'Forbidden') {
                                unfollower.suspended = true;
                            }
                        }
                    } catch (err) {
                        if (err instanceof ApiResponseError && err.code === 429) {
                            logger.debug('Too many requests, will ignore suspended/blocked detection');
                            return;
                        }
                        await this.manageTwitterErrors(err, username, userId);
                    }
                })
        );

        const params = await userDao.getUserParams();
        // get the list of blocked people to see if the person was blocked
        if (params.dmId === userId || params.isTemporarySecondAppToken) {
            // only if the app has access to that list
            await twitterApi.v2
                .userBlockingUsers(userId, { max_results: 1000 })
                .then((blockedUsers) => {
                    blockedUsers.users.forEach((blockedUser) => {
                        const unfollowerInfo = unfollowersMap.get(blockedUser.id);
                        if (unfollowerInfo) {
                            unfollowerInfo.blocking = true;
                        }
                    });
                })
                .catch((err) => this.manageTwitterErrors(err, username, userId));
        }

        // get missing usernames from the cache
        await Promise.all(
            unfollowersInfo.map(async (unfollower) => {
                if (!unfollower.username) {
                    const cachedUsername = await this.dao.getCachedUsername(unfollower.id);
                    if (cachedUsername) {
                        unfollower.username = cachedUsername;
                    }
                }
            })
        );

        // we remove unfollowers that followed the user < 24h and that "left twitter" (glitches very probably)
        let realUnfollowersInfo = unfollowersInfo.filter((unfollowerInfo) => {
            const followDuration = unfollowerInfo.unfollowTime - (unfollowerInfo.followDetectedTime || 0);
            unfollowerInfo.skippedBecauseGlitchy = !(
                !(unfollowerInfo.deleted && followDuration < 24 * 60 * 60 * 1000) &&
                !(followDuration < 60 * 60 * 1000) &&
                followDuration > Math.max(MINUTES_BETWEEN_CHECKS * 2 + 1, 7) * 60 * 1000 &&
                !(process.env.GLITCHY_USERS?.split(',') || []).includes(unfollowerInfo.id)
            );
            return !unfollowerInfo.skippedBecauseGlitchy;
        });

        unfollowersInfo.forEach((unfollower) =>
            this.dao.userEventDao.logUnfollowerEvent(userId, isSecondTry, unfollower)
        );

        if (!isSecondTry) {
            const potentialGlitches = realUnfollowersInfo.filter((unfollowerInfo) => unfollowerInfo.deleted);

            // If it's the first check, check them again in 15min to be sure that they were really glitches
            if (potentialGlitches.length > 0) {
                await this.queue.add(
                    'notifyUser',
                    {
                        userId,
                        username,
                        unfollowersInfo: potentialGlitches,
                        isSecondTry: true,
                    },
                    { delay: 15 * 60 * 1000 }
                );

                const potentialGlitchesSet = new Set(potentialGlitches);
                realUnfollowersInfo = realUnfollowersInfo.filter((value) => !potentialGlitchesSet.has(value));
            }
            metrics.increment('notifyUser.nbFirstTry');
        }
        metrics.increment('notifyUser.count');

        if (realUnfollowersInfo.length > 0) {
            const message = this.generateMessage(realUnfollowersInfo, await userDao.getLang(), leftovers.length);

            await this.dao.userEventDao.logNotificationEvent(
                userId,
                NotificationEvent.unfollowersMessage,
                await userDao.getDmId(),
                message
            );

            const dmTwit = await userDao.getDmTwitterApi();
            logger.info('sending a DM to @%s', username);

            await dmTwit.v2
                .sendDmToParticipant(userId, { text: message })
                .catch((err) => this.manageTwitterErrors(err, username, userId));

            metrics.increment('notifyUser.dmsSent');
            metrics.increment('notifyUser.nbUnfollowers', realUnfollowersInfo.length + leftovers.length);
        }
    }

    private generateMessage(unfollowersInfo: IUnfollowerInfo[], lang: Lang, nbLeftovers: number): string {
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

        const userDao = this.dao.getUserDao(userId);

        for (const { code, message } of [err]) {
            switch (code) {
                case 17: // no user matches the specified terms (users/lookup)
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
                    throw new Error('the user reached its rate-limit (notifyUser)');
                default:
                    throw new Error(
                        `An unexpected twitter error occured: ${code} ${message} ${err.data.title} ${err.data.detail}`
                    );
            }
        }
        return false;
    }
}
