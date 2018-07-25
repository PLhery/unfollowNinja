import {ProcessCallback} from 'kue';

import checkFollowers from './checkFollowers';
import createTwitterTasks from './createTwitterTasks';
import getFollowerInfos from './getFollowerInfos';
import notifyUser from './notifyUser';
import sendWelcomeMessage from './sendWelcomeMessage';

const tasks: {[taskName: string]: any} = {
    checkFollowers,
    createTwitterTasks,
    getFollowerInfos,
    notifyUser,
    sendWelcomeMessage,
};

export const customRateLimits: {[taskName: string]: number} = {
    cacheUsername: 1, // avoid concurrency
};

export default tasks;
