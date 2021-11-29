import i18n from 'i18n';
import type {Job} from 'bull';
import {defaults, difference, get, keyBy} from 'lodash';
import moment from 'moment-timezone';
import {Params, Twitter} from 'twit';
import {UserCategory} from '../dao/dao';
import logger from '../utils/logger';
import {IUnfollowerInfo, Lang} from '../utils/types';
import Task from './task';
import metrics from '../utils/metrics';
import { NotificationEvent } from '../dao/userEventDao';

i18n.configure({
    locales: ['en', 'fr', 'es', 'pt', 'id'],
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
        const {userId, isSecondTry} = job.data;
        const userDao = this.dao.getUserDao(userId);
        const username = await userDao.getUsername();

        const twit = await userDao.getTwit();
        const unfollowersInfo: IUnfollowerInfo[] = job.data.unfollowersInfo;
        let stopThere = false;

        const leftovers = unfollowersInfo.splice(MAX_UNFOLLOWERS);

        unfollowersInfo.forEach(u => u.suspended = true);
        const unfollowersIds = unfollowersInfo.map(u => u.id);
        const unfollowersMap = keyBy(unfollowersInfo, 'id');

        // cache twittos and know who's suspended
        const usersLookup = await twit.post('users/lookup', {
            user_id: unfollowersIds.join(','),
            include_entities: false,
        }).catch(
            (err) => this.manageTwitterErrors(err, username, userId)
                .then((stop) => stop ? stopThere = true : {data: []}),
        ) as { data: Twitter.User[] };

        if (stopThere) {
            return;
        }

        await Promise.all(usersLookup.data.map(user => {
            unfollowersMap[user.id_str].suspended = false;
            unfollowersMap[user.id_str].locked = (user.friends_count === 0);
            unfollowersMap[user.id_str].username = user.screen_name;
            return this.dao.addTwittoToCache({
                id: user.id_str,
                username: user.screen_name,
            });
        }));

        // know who you're blocking or blocked you
        await Promise.all(unfollowersInfo.map(async unfollower => { // know if we're blocked / if we blocked them
            let errorCode = null;
            // in @types/twit 2.2.23 target_id must be a number, however it's safer to send a string TODO PR @types/twit
            const friendship = await twit.get('friendships/show', {target_id: unfollower.id} as any as Params)
                .catch(async (err) => {
                    await this.manageTwitterErrors(err, username, userId);
                    errorCode = get(err, 'twitterReply.errors[0].code', null);
                    return {};
                }) as any;
            if (friendship.data && friendship.data.relationship) {
                if (!unfollower.username) {
                    const {id_str, screen_name} = friendship.data.relationship.target;
                    unfollower.username = screen_name;
                    await this.dao.addTwittoToCache({
                        id: id_str,
                        username: screen_name,
                    });
                }
                const {blocking, blocked_by, following, followed_by} = friendship.data.relationship.source;
                defaults(unfollower, {blocking, blocked_by, following, followed_by});
            }
            if (errorCode !== null) {
                unfollower.friendship_error_code = errorCode;
                if (errorCode === 50) {
                    unfollower.suspended = false;
                    unfollower.deleted = true;
                }
            }
        }));

        // get missing usernames from the cache
        await Promise.all(unfollowersInfo.map(async unfollower => {
            if (!unfollower.username) {
                const cachedUsername = await this.dao.getCachedUsername(unfollower.id);
                if (cachedUsername) {
                    unfollower.username = cachedUsername;
                }
            }
        }));

        // we remove unfollowers that followed the user < 24h and that "left twitter" (glitches very probably)
        let realUnfollowersInfo = unfollowersInfo.filter(unfollowerInfo => {
            const followDuration = unfollowerInfo.unfollowTime - unfollowerInfo.followDetectedTime;
            unfollowerInfo.skippedBecauseGlitchy =
                unfollowerInfo.followed_by !== true &&
                !(unfollowerInfo.deleted && followDuration < 24 * 60 * 60 * 1000) &&
                followDuration > Math.max(MINUTES_BETWEEN_CHECKS*2+1, 7) * 60 * 1000;
            return unfollowerInfo.skippedBecauseGlitchy;
        });

      unfollowersInfo.forEach((unfollower) =>
        this.dao.userEventDao.logUnfollowerEvent(userId, isSecondTry, unfollower))

        if (!isSecondTry) {
            const potentialGlitches = realUnfollowersInfo.filter(unfollowerInfo => unfollowerInfo.deleted);

            // If it's the first check, check them again in 15min to be sure that they were really glitches
            if (potentialGlitches.length > 0) {
              await this.queue.add('notifyUser',
                  {
                    userId,
                    username,
                    unfollowersInfo: potentialGlitches,
                    isSecondTry: true,
                  },
                  { delay: 15 * 60 * 1000 }
                );
                realUnfollowersInfo = difference(realUnfollowersInfo, potentialGlitches);
            }
            metrics.increment('notifyUser.nbFirstTry');
        }
        metrics.increment('notifyUser.count');

        if (realUnfollowersInfo.length > 0) {
            const message = this.generateMessage(realUnfollowersInfo, await userDao.getLang(), leftovers.length);

            this.dao.userEventDao
              .logNotificationEvent(userId, NotificationEvent.unfollowersMessage, await userDao.getDmId(), message);

            const dmTwit = await userDao.getDmTwit();
            logger.info('sending a DM to @%s', username);

            await dmTwit.post('direct_messages/events/new', {
                event: {
                    type: 'message_create',
                    message_create: {target: {recipient_id: userId}, message_data: {text: message}},
                },
            } as Params)
                .catch((err) => this.manageTwitterErrors(err, username, userId));

            metrics.increment('notifyUser.dmsSent');
            metrics.increment('notifyUser.nbUnfollowers', realUnfollowersInfo.length + leftovers.length);
        }
    }

    private generateMessage(unfollowersInfo: IUnfollowerInfo[], lang: Lang, nbLeftovers: number): string {
        i18n.setLocale(lang);
        const messages: string[] = unfollowersInfo.map((unfollower) => {
            let username = unfollower.username ? '@' + unfollower.username : i18n.__('one of you followers');

            let customEmoji = '';
            if (unfollower.username === 'louanben') { // https://twitter.com/louanben/status/1246045006529531910
                customEmoji = '\n👁👄👁';
                username += ' 👦🏽'
            }
            let action;
            if (unfollower.suspended) {
                const emoji = '🙈' + customEmoji;
                action = i18n.__('{{username}} has been suspended {{emoji}}.', { username, emoji });
            } else if (unfollower.deleted) {
                const emoji = '🙈' + customEmoji;
                action = i18n.__('{{username}} has left Twitter {{emoji}}.', { username, emoji });
            } else if (unfollower.blocked_by) {
                const emoji = '⛔️' + customEmoji;
                action = i18n.__('{{username}} blocked you {{emoji}}.', { username, emoji });
            } else if (unfollower.blocking) {
                const emoji = '💩💩💩' + customEmoji;
                action = i18n.__('You blocked {{username}} {{emoji}}.', { username, emoji });
            } else if (unfollower.locked) {
                const emoji = '🔒' + (unfollower.following ? customEmoji || '💔' : customEmoji);
                action = i18n.__('{{username}}\'s account has been locked {{emoji}}.', { username, emoji });
            } else if (unfollower.following) {
                const emoji = customEmoji || '💔';
                action = i18n.__('{{username}} unfollowed you {{emoji}}.', { username, emoji });
            } else {
                const emoji = customEmoji || '👋';
                action = i18n.__('{{username}} unfollowed you {{emoji}}.', { username, emoji });
            }

            let followTimeMsg;
            if (unfollower.followTime > 0) {
                const duration = moment(unfollower.followTime).locale(lang).to(unfollower.unfollowTime, true);
                const time = moment(unfollower.followTime).locale(lang).calendar();
                followTimeMsg = i18n.__('This account followed you for {{duration}} ({{{time}}}).', {duration, time});
            } else {
                followTimeMsg = i18n.__(
                  'This account followed you before you signed up to @{{twitterAccount}}!',
                  {twitterAccount: TWITTER_ACCOUNT}
                );
            }

            return action + '\n' + followTimeMsg;
        });

        if (messages.length === 1) {
            return messages[0];
        }
        const nbUnfollows = (messages.length + nbLeftovers).toString();
        let message = i18n.__('{{nbUnfollows}} Twitter users unfollowed you:', { nbUnfollows });
        for (const unfollowerMessage of messages) {
            message += '\n  • ' + unfollowerMessage;
        }
        if (nbLeftovers > 0) {
            message += '\n  • ' + i18n.__('and {{nbLeftovers}} more.', { nbLeftovers: nbLeftovers.toString() });
        }
        return message;
    }

    // throw an error if it's a twitter problem
    // return true if we can't continue to process the user
    private async manageTwitterErrors(err: any, username: string, userId: string): Promise<boolean> {

        if (!err.twitterReply) {
            throw err;
        }
        const twitterReply: Twitter.Errors = err.twitterReply;

        const userDao = this.dao.getUserDao(userId);

        for (const { code, message } of twitterReply.errors) {
            switch (code) {
                case 17: // no user matches the specified terms (users/lookup)
                case 50: // user not found (friendship/show)
                    break;
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
                    return true;
                case 326:
                case 64:
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
                    throw new Error(`An unexpected twitter error occured: ${code} ${message}`);
            }
        }
        return false;
    }
}
