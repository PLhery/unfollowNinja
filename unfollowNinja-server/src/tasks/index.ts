import cacheFollowers from './cacheFollowers';
import checkFollowers from './checkFollowers';
import createTwitterTasks from './createTwitterTasks';
import notifyUser from './notifyUser';
import sendWelcomeMessage from './sendWelcomeMessage';

const tasks: {[taskName: string]: any} = {
    cacheFollowers,
    checkFollowers,
    createTwitterTasks,
    notifyUser,
    sendWelcomeMessage,
};

export default tasks;
