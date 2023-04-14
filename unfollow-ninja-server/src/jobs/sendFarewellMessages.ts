import 'dotenv/config';

import Dao, { UserCategory } from '../dao/dao';
import logger from '../utils/logger';
import moment from 'moment-timezone';
import { FollowEvent, NotificationEvent } from '../dao/userEventDao';

// The code is a bit dirty sometimes, but a one-time script
async function run() {
    const startTime = Date.now(); // Used to make sure we don't go faster than 10 000 DMs/d = 6 DMs/min

    const dao = await new Dao().load();
    const userIds = await dao.getUserIdsByCategory(UserCategory.enabled);

    let sent = 0;
    let errored = 0;
    let skipped = 0;

    for (const userId of userIds) {
        const userDao = dao.getUserDao(userId);
        try {
            const isSent =
                (await dao.redis.get('recapSent:' + userId)) === '1' ||
                (await dao.redis.get('recapErred:' + userId)) === '1';
            if (isSent) {
                skipped++;
                console.log(
                    'sent',
                    sent,
                    'errored',
                    errored,
                    'skipped',
                    skipped,
                    'left',
                    userIds.length - sent - errored - skipped
                );
                continue;
            }

            console.log('preparing message for', userId, await dao.getCachedUsername(userId));
            const OFFSET_SIZE = 1000;
            console.log('a', new Date());
            let offset = 0;
            let newNotifs = await dao.userEventDao.getNotificationEvents(userId, OFFSET_SIZE);
            const notifications = newNotifs;
            while (newNotifs.length > 0) {
                offset += OFFSET_SIZE;
                newNotifs = await dao.userEventDao.getNotificationEvents(userId, OFFSET_SIZE, offset);
                notifications.push(...newNotifs);
            }
            console.log('b', new Date());

            if (notifications.length < 10) {
                await dao.redis.set('recapSent:' + userId, '1');
                skipped++;
                console.log(
                    'sent',
                    sent,
                    'errored',
                    errored,
                    'skipped',
                    skipped,
                    'left',
                    userIds.length - sent - errored - skipped
                );
                console.log('skipping because not enough notifications', notifications.length);
                continue;
            }
            offset = 0;
            let newEvents = await dao.userEventDao.getUnfollowerEvents(userId, OFFSET_SIZE);
            const unfollowerEvents = newEvents;
            while (newEvents.length > 0) {
                offset += OFFSET_SIZE;
                newEvents = await dao.userEventDao.getUnfollowerEvents(userId, OFFSET_SIZE, offset);
                unfollowerEvents.push(...newEvents);
            }
            console.log('c', new Date());

            offset = 0;
            let newFEvents = await dao.userEventDao.getFollowEvent(userId, OFFSET_SIZE);
            const followEvents = newFEvents;
            while (newFEvents.length > 0) {
                offset += OFFSET_SIZE;
                newFEvents = await dao.userEventDao.getFollowEvent(userId, OFFSET_SIZE, offset);
                followEvents.push(...newFEvents);
            }
            console.log('d', new Date());

            const monthsSinceFirstNotif = Math.floor(
                (Date.now() - new Date(notifications[notifications.length - 1].createdAt).getTime()) /
                    (1000 * 60 * 60 * 24 * 30)
            );

            const unfollowerBiggestFTime = unfollowerEvents
                .filter((event) => event.followTime > 0)
                .reduce(
                    (acc, event) =>
                        new Date(event.getDataValue('createdAt' as any)).getTime() / 1000 - event.followTime >
                        new Date(acc.getDataValue('createdAt' as any)).getTime() / 1000 - acc.followTime
                            ? !followEvents.find(
                                  (fevent) =>
                                      fevent.event === FollowEvent.followDetected &&
                                      fevent.followerId === event.followerId &&
                                      new Date(fevent['createdAt'] as string) >
                                          new Date(event.getDataValue('createdAt' as any))
                              )
                                ? event
                                : acc
                            : acc,
                    unfollowerEvents.filter((event) => event.followTime > 0)[0]
                );

            const mutualBiggestFTime = unfollowerEvents
                .filter((event) => event.followTime > 0 && event.following)
                .reduce(
                    (acc, event) =>
                        new Date(event.getDataValue('createdAt' as any)).getTime() / 1000 - event.followTime >
                        new Date(acc.getDataValue('createdAt' as any)).getTime() / 1000 - acc.followTime
                            ? !followEvents.find(
                                  (fevent) =>
                                      fevent.event === FollowEvent.followDetected &&
                                      fevent.followerId === event.followerId &&
                                      new Date(fevent['createdAt'] as string) >
                                          new Date(event.getDataValue('createdAt' as any))
                              )
                                ? event
                                : acc
                            : acc,
                    unfollowerEvents.filter((event) => event.followTime > 0 && event.following)[0]
                );

            const usernameBiggestFTime = await dao.getCachedUsername(unfollowerBiggestFTime.followerId);

            let mutuMessage = '';
            if (mutualBiggestFTime?.followerId && mutualBiggestFTime.followerId !== unfollowerBiggestFTime.followerId) {
                mutuMessage = `- 👯 Your longest-time ex-mutual was @${await dao.getCachedUsername(
                    mutualBiggestFTime.followerId
                )}, who followed you for ${moment(mutualBiggestFTime.followTime * 1000).to(
                    mutualBiggestFTime.getDataValue('createdAt' as any),
                    true
                )} between ${moment(mutualBiggestFTime.followTime * 1000).calendar()} and ${moment(
                    mutualBiggestFTime.getDataValue('createdAt' as any)
                ).calendar()}.\n`;
            }

            const duration = moment(unfollowerBiggestFTime.followTime * 1000).to(
                unfollowerBiggestFTime.getDataValue('createdAt' as any),
                true
            );
            const time1 = moment(unfollowerBiggestFTime.followTime * 1000).calendar();
            const time2 = moment(unfollowerBiggestFTime.getDataValue('createdAt' as any)).calendar();

            const message =
                'Hello,\nSince the 7th of April, @UnfollowMonkey notifications have stopped being sent 😢.\n' +
                "Twitter's new app limitations, with a cost of 1200$/year, makes it impossible for us to continue offering the service for free.\n\n" +
                `Before we part ways, here's a recap of the past ${monthsSinceFirstNotif} months and ${notifications.length} notifications with us:\n\n` +
                `- 🫡 You've been unfollowed by ${
                    new Set(
                        followEvents
                            .filter((event) => event.event === FollowEvent.unfollowDetected)
                            .map((event) => event.followerId)
                    ).size
                } Twitter users.\n` +
                `- 💔 Among them, ${
                    new Set(unfollowerEvents.filter((event) => event.following).map((event) => event.followerId)).size
                } were mutuals.\n` +
                `- 🚮 ${
                    new Set(
                        unfollowerEvents
                            .filter((event) => event.deleted && event.isSecondCheck)
                            .map((event) => event.followerId)
                    ).size
                } deleted their accounts and ${
                    new Set(unfollowerEvents.filter((event) => event.suspended).map((event) => event.followerId)).size
                } got suspended.\n` +
                `- 💩 ${
                    new Set(unfollowerEvents.filter((event) => event.blockedBy).map((event) => event.followerId)).size
                } blocked you, but you blocked ${
                    new Set(unfollowerEvents.filter((event) => event.blocking).map((event) => event.followerId)).size
                }.\n` +
                `- 👴 Your longest-time unfollower was @${usernameBiggestFTime}, who followed you for ${duration} between ${time1} and ${time2}.\n` +
                mutuMessage +
                '\n' +
                `We're offering a new paid option to keep the service alive for 3$/month by leveraging Twitter's paid offer, don't hesitate to have a look on our website.\n` +
                `It's been a pleasure helping you\n🐵♥️🫡`;

            console.log(message);
            const twitterApi = await userDao.getDmTwitterApi();
            await twitterApi.v2.sendDmToParticipant(userId, { text: message });
            await dao.userEventDao.logNotificationEvent(
                userId,
                NotificationEvent.farewellRecapMessage,
                await userDao.getDmId(),
                message
            );
            console.log('DM sent to', userId, await dao.getCachedUsername(userId));
            sent++;
            await dao.redis.set('recapSent:' + userId, '1');
        } catch (error) {
            console.error(error);
            errored++;
            await dao.redis.set('recapErred:' + userId, '1');
        }
        console.log(
            'sent',
            sent,
            'errored',
            errored,
            'skipped',
            skipped,
            'left',
            userIds.length - sent - errored - skipped
        );

        // if we're sending at a rate above 10k DMs/day, slow down
        const timeToWaitToReachRateLimit = (sent * (24 * 60 * 60 * 1000)) / 10000 - (Date.now() - startTime);
        if (timeToWaitToReachRateLimit > 0) {
            console.log('slow down for ', Math.floor(timeToWaitToReachRateLimit / 1000), 'secs');
            await new Promise((resolve) => setTimeout(resolve, timeToWaitToReachRateLimit));
        }
    }
    await dao.disconnect();
}
run().catch((error) => logger.error(error, error.stack));
