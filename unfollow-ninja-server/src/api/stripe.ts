import type {Queue} from 'bull';

import {WebEvent} from '../dao/userEventDao';
import {UserCategory} from '../dao/dao';
import type Dao from '../dao/dao';

export const enablePro = async (dao: Dao, queue: Queue, userId: string, plan: 'friends' | 'pro', ip: string, subscriptionId: string) => {
  const userDao = dao.getUserDao(userId);
  const username = await dao.getCachedUsername(userId);

  if (plan === 'friends') {
    dao.userEventDao.logWebEvent(userId, WebEvent.enableFriends, ip, username, subscriptionId);
    await userDao.setUserParams({pro: '2'});
    await userDao.addFriendCodes();
  } else {
    dao.userEventDao.logWebEvent(userId, WebEvent.enablePro, ip, username, subscriptionId);
    await userDao.setUserParams({pro: '1'});
  }
  await userDao.setCategory(UserCategory.vip);

  await queue.add('sendWelcomeMessage', {
    id: Date.now(),
    userId,
    username,
    isPro: true,
  });
}

export const disablePro = async (dao: Dao, userId: string, ip: string, subscriptionId: string) => {
  const userDao = dao.getUserDao(userId);
  const username = await dao.getCachedUsername(userId);

  dao.userEventDao.logWebEvent(userId, WebEvent.disablePro, ip, username, subscriptionId);
  await userDao.setUserParams({pro: '0'});
  for (const code of await userDao.getFriendCodes()) {
    if (code.friendId) { // disable pro for friends too
      const friendUsername = await dao.getCachedUsername(code.friendId);
      dao.userEventDao.logWebEvent(userId, WebEvent.disableFriendRegistration, ip, friendUsername, code.friendId);
      dao.userEventDao.logWebEvent(code.friendId, WebEvent.disableFriendRegistration, ip, friendUsername, code.userId);
      await dao.getUserDao(code.friendId).setUserParams({pro: '0'});
      if (UserCategory.vip === await dao.getUserDao(code.friendId).getCategory()) {
        await dao.getUserDao(code.friendId).setCategory(UserCategory.enabled);
      }
    }
    await userDao.deleteFriendCodes(code.code);
  }
  if (UserCategory.vip === await userDao.getCategory()) {
    await userDao.setCategory(UserCategory.enabled);
  }
}