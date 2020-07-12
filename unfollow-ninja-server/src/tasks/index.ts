import notifyUser from './notifyUser';
import reenableFollowers from './reenableFollowers';
import sendWelcomeMessage from './sendWelcomeMessage';

const tasks: {[taskName: string]: any} = {
    notifyUser,
    reenableFollowers,
    sendWelcomeMessage,
};

export default tasks;
