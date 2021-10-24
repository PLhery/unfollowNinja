import notifyUser from './notifyUser';
import reenableFollowers from './reenableFollowers';
import sendWelcomeMessage from './sendWelcomeMessage';
import updateMetrics from './updateMetrics';
import type { TaskClass } from './task';


const tasks: {[taskName: string]: TaskClass} = {
    notifyUser,
    reenableFollowers,
    sendWelcomeMessage,
    updateMetrics,
};

export default tasks;
