import * as i18n from 'i18n';
import { Job } from 'kue';
import { defaults, keyBy, split } from 'lodash';
import * as moment from 'moment';
import * as emojis from 'node-emoji';
import { Params, Twitter } from 'twit';
import { UserCategory } from '../dao/dao';
import logger from '../utils/logger';
import { IUnfollowerInfo, Lang } from '../utils/types';
import Task from './task';

i18n.configure({
    locales: ['en', 'fr'],
    directory: __dirname + '/../../locales',
});

const BETA_USERS = split(process.env.BETA_USERS, ',').concat('testUsername');

// friendships/show can be called 180 times/15min
// with this limit it will be called < 120 times/15min
const MAX_UNFOLLOWERS = 15;

export default class extends Task {
    public async run(job: Job) {
        const { username, userId } = job.data;
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
                .then((stop) => stop ? stopThere = true : { data: []}),
        ) as { data: Twitter.User[] };

        if (stopThere) {
            return;
        }

        await Promise.all(usersLookup.data.map(user => {
            unfollowersMap[user.id_str].suspended = false;
            unfollowersMap[user.id_str].username = user.screen_name;
            return this.dao.addTwittoToCache({
                id: user.id_str,
                username: user.screen_name,
                picture: user.profile_image_url_https,
            });
        }));

        // know who you're blocking or blocked you
        await Promise.all(unfollowersInfo.map(async unfollower => { // know if we're blocked / if we blocked them
            const friendship = await twit.get('friendships/show', {target_id: unfollower.id} as Params)
                .catch((err) => this.manageTwitterErrors(err, username, userId).then(() => ({}))) as any;
            if (friendship.data && friendship.data.relationship) {
                if (!unfollower.username) {
                    const { id_str, screen_name } = friendship.data.relationship.target;
                    unfollower.username = screen_name;
                    await this.dao.addTwittoToCache({
                        id: id_str,
                        username: screen_name,
                    });
                }
                const {blocking, blocked_by, following, followed_by} = friendship.data.relationship.source;
                defaults(unfollower, {blocking, blocked_by, following});
                if (followed_by) {
                    logger.error('An unexpected thing happened: @%s was unfollowed by @%s but followed_by=true',
                        username, unfollower.username);
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
        userDao.addUnfollowers(unfollowersInfo.concat(leftovers));

        const message = this.generateMessage(unfollowersInfo, await userDao.getLang(), leftovers.length);

        const dmTwit = await userDao.getDmTwit();
        logger.info('sending a DM to @%s', username);
        logger.debug('sending a DM to @%s: %s', username, message);
        if (BETA_USERS.includes(username)) {
            await dmTwit.post('direct_messages/events/new', {
                event: {
                    type: 'message_create',
                    message_create: {target: {recipient_id: userId}, message_data: {text: message}},
                },
            } as Params)
                .catch((err) => this.manageTwitterErrors(err, username, userId));
        }
    }

    private generateMessage(unfollowersInfo: IUnfollowerInfo[], lang: Lang, nbLeftovers: number): string {
        i18n.setLocale(lang);
        const messages: string[] = unfollowersInfo.map((unfollower) => {
            const username = unfollower.username ? '@' + unfollower.username : i18n.__('one of you followers');

            let action;
            if (unfollower.suspended) {
                const emoji = emojis.get('see_no_evil');
                action = i18n.__('{{username}} has been suspended {{emoji}}.', { username, emoji });
            } else if (unfollower.blocked_by) {
                const emoji = emojis.get('no-entry');
                action = i18n.__('{{username}} blocked you {{emoji}}💩💩💩💩💩.', { username, emoji });
            } else if (unfollower.blocking) {
                const emoji = emojis.get('poop');
                action = i18n.__('You blocked {{username}} {{emoji}}💩💩💩💩💩.', { username, emoji });
            } else {
                const emoji = emojis.get(unfollower.following ? 'broken_heart' : 'wave');
                action = i18n.__('{{username}} unfollowed you {{emoji}}.', { username, emoji });
            }

            let followTimeMsg;
            if (unfollower.followTime > 0) {
                const duration = moment(unfollower.followTime).locale(lang).toNow(true);
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
