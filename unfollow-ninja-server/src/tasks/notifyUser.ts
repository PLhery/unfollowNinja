import i18n from 'i18n';
import { Job } from 'kue';
import { defaults, difference, get, keyBy, split } from 'lodash';
import moment from 'moment-timezone';
import emojis from 'node-emoji';
import { Params, Twitter } from 'twit';
import { promisify } from 'util';
import { UserCategory } from '../dao/dao';
import logger from '../utils/logger';
import { IUnfollowerInfo, Lang } from '../utils/types';
import Task from './task';
import metrics from '../utils/metrics';

i18n.configure({
    locales: ['en', 'fr'],
    directory: __dirname + '/../../locales',
});

moment.tz.setDefault('Europe/Paris');

// const BETA_USERS = split(process.env.BETA_USERS, ',').concat('testUsername');
const MINUTES_BETWEEN_CHECKS = Number(process.env.MINUTES_BETWEEN_CHECKS) || 2;

// friendships/show can be called 180 times/15min
// with this limit it can be called max 200 times/15min (if checked 8 times)
const MAX_UNFOLLOWERS = 25;

export default class extends Task {
    public async run(job: Job) {
        const {username, userId, isSecondTry} = job.data;
        logger.debug('notifying @%s...', username);
        const userDao = this.dao.getUserDao(userId);
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

        if (!Array.isArray(usersLookup.data)) {
            logger.warn('@%s - expected userLookup.data to be an array, was %s instead.',
                username, JSON.stringify(usersLookup.data));
            return;
        }

        await Promise.all(usersLookup.data.map(user => {
            unfollowersMap[user.id_str].suspended = false;
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

        logger.debug('@%s has new unfollowers: %s', username, JSON.stringify(unfollowersInfo.concat(leftovers)));

        // we remove unfollowers that followed the user < 24h and that "left twitter" (glitches very probably)
        let realUnfollowersInfo = unfollowersInfo.filter(unfollowerInfo => {
            const followDuration = unfollowerInfo.unfollowTime - unfollowerInfo.followDetectedTime;
            return unfollowerInfo.followed_by !== true &&
                !(unfollowerInfo.deleted && followDuration < 24 * 60 * 60 * 1000) &&
                followDuration > Math.max(MINUTES_BETWEEN_CHECKS*2+1, 7) * 60 * 1000;
        });

        if (!isSecondTry) {
            const potentialGlitches = realUnfollowersInfo.filter(unfollowerInfo => unfollowerInfo.deleted);

            // If it's the first check, check them again in 15min to be sure that they were really glitches
            if (potentialGlitches.length > 0) {
                await promisify((cb) =>
                    this.queue
                        .create('notifyUser', {
                            title: `(second check) Notify @${username} that he's been unfollowed by ` +
                                potentialGlitches.map((u) => u.id).toString(),
                            userId,
                            username,
                            unfollowersInfo: potentialGlitches,
                            isSecondTry: true,
                        })
                        .delay(15 * 60 * 1000)
                        .attempts(5)
                        .backoff( {delay: 60000, type: 'exponential'})
                        .removeOnComplete(true)
                        .save(cb),
                )();
                realUnfollowersInfo = difference(realUnfollowersInfo, potentialGlitches);
            }
            metrics.increment('uninja.notifyUser.nbFirstTry');
        }
        metrics.increment('uninja.notifyUser.count');

        if (realUnfollowersInfo.length > 0) {
            userDao.addUnfollowers(realUnfollowersInfo.concat(leftovers));
            const message = this.generateMessage(realUnfollowersInfo, await userDao.getLang(), leftovers.length);

            let dmTwit;
            try {
                dmTwit = await userDao.getDmTwit();
            } catch (error) {
                // temporary: some accounts that didn't pass the second step were enabled due to an API code bug
                if (error?.message?.endsWith('didn\'t have any DM credentials stored')) {
                    await userDao.setCategory(UserCategory.disabled);
                }
                throw error;
            }
            logger.info('sending a DM to @%s', username);
            logger.debug('sending a DM to @%s: %s', username, message);
            await dmTwit.post('direct_messages/events/new', {
                event: {
                    type: 'message_create',
                    message_create: {target: {recipient_id: userId}, message_data: {text: message}},
                },
            } as Params)
                .catch((err) => this.manageTwitterErrors(err, username, userId));

            metrics.increment('uninja.notifyUser.dmsSent');
            metrics.increment('uninja.notifyUser.nbUnfollowers', realUnfollowersInfo.length + leftovers.length);
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
                const emoji = emojis.get('see_no_evil') + customEmoji;
                action = i18n.__('{{username}} has been suspended {{emoji}}.', { username, emoji });
            } else if (unfollower.deleted) {
                const emoji = emojis.get('see_no_evil') + customEmoji;
                action = i18n.__('{{username}} has left Twitter {{emoji}}.', { username, emoji });
            } else if (unfollower.blocked_by) {
                const emoji = emojis.get('no_entry') + customEmoji;
                action = i18n.__('{{username}} blocked you {{emoji}}.', { username, emoji });
            } else if (unfollower.blocking) {
                const emoji = emojis.get('poop').repeat(3) + customEmoji;
                action = i18n.__('You blocked {{username}} {{emoji}}.', { username, emoji });
            } else if (unfollower.following) {
                const emoji = customEmoji || emojis.get('broken_heart');
                action = i18n.__('{{username}} unfollowed you {{emoji}}.', { username, emoji });
            } else {
                const emoji = customEmoji || emojis.get('wave');
                action = i18n.__('{{username}} unfollowed you {{emoji}}.', { username, emoji });
            }

            let followTimeMsg;
            if (unfollower.followTime > 0) {
                const duration = moment(unfollower.followTime).locale(lang).to(unfollower.unfollowTime, true);
                const time = moment(unfollower.followTime).locale(lang).calendar();
                followTimeMsg = i18n.__('This account followed you for {{duration}} ({{{time}}}).', {duration, time});
            } else {
                followTimeMsg = i18n.__('This account followed you before you signed up to @unfollowninja!');
            }

            return action + '\n' + followTimeMsg;
        });

        if (messages.length === 1) {
            return messages[0];
        }
        const nbUnfollows = (messages.length + nbLeftovers).toString();
        let message = i18n.__('{{nbUnfollows}} twitter users unfollowed you:', { nbUnfollows });
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
                    logger.warn('@%s revoked the token. removing him from the list...', username);
                    await userDao.setCategory(UserCategory.revoked);
                    return true;
                case 326:
                case 64:
                    logger.warn('@%s is suspended. removing him from the list...', username);
                    await userDao.setCategory(UserCategory.suspended);
                    return true;
                case 150: // dm closed to non-followers
                case 349: // user blocked?
                    logger.warn('@%s does not accept DMs. removing him from the list...', username);
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
