import cacheFollowers from './cacheFollowers';
import checkFollowers from './checkFollowers';
import createTwitterTasks from './createTwitterTasks';
import notifyUser from './notifyUser';
import reenableFollowers from './reenableFollowers';
import sendWelcomeMessage from './sendWelcomeMessage';

const tasks: {[taskName: string]: any} = {
    cacheFollowers,
    checkFollowers,
    createTwitterTasks,
    notifyUser,
    reenableFollowers,
    sendWelcomeMessage,
};

export default tasks;
