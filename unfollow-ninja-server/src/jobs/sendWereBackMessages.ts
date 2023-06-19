import 'dotenv/config';

import Dao, { UserCategory } from '../dao/dao';
import logger from '../utils/logger';

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
                (await dao.redis.get('recapBackSent:' + userId)) === '1' ||
                (await dao.redis.get('recapBackErred:' + userId)) === '1';

            const [isTemporarySecondAppToken] = await dao.redis.hmget(`user:${userId}`, 'isTemporarySecondAppToken');
            if (isSent || isTemporarySecondAppToken) {
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

            const message =
                'Hello 🐵♥️\n' +
                "A quick message from @UnfollowMonkey to make you know we're back online, for free!\n\n" +
                'You can check who unfollowed you these last months from our website, no DMs will be sent anymore.\n' +
                'Cheers 🦧';

            const twitterApi = await userDao.getDmTwitterApi();
            await twitterApi.v2.sendDmToParticipant(userId, { text: message });
            console.log('DM sent to', userId, await dao.getCachedUsername(userId));
            sent++;
            await dao.redis.set('recapBackSent:' + userId, '1');
        } catch (error) {
            console.error(error);
            errored++;
            await dao.redis.set('recapBackErred:' + userId, '1');
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

        // if we're sending at a rate above 15k DMs/day, slow down
        const timeToWaitToReachRateLimit = (sent * (24 * 60 * 60 * 1000)) / 15000 - (Date.now() - startTime);
        if (timeToWaitToReachRateLimit > 0) {
            console.log('slow down for ', Math.floor(timeToWaitToReachRateLimit / 1000), 'secs');
            await new Promise((resolve) => setTimeout(resolve, timeToWaitToReachRateLimit));
        }
    }
    await dao.disconnect();
}
run().catch((error) => logger.error(error, error.stack));
