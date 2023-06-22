import notifyUser from './notifyUser';
import reenableFollowers from './reenableFollowers';
import sendWelcomeMessage from './sendWelcomeMessage';
import updateMetrics from './updateMetrics';
import sendDailyDM from './sendDailyDM';
import type { TaskClass } from './task';

const tasks: { [taskName: string]: TaskClass } = {
    notifyUser,
    reenableFollowers,
    sendWelcomeMessage,
    updateMetrics,
    sendDailyDM,
};

export default tasks;
