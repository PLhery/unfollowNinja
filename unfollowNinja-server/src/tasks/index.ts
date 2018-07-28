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

export default tasks;
