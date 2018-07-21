import {ProcessCallback} from "kue";

import checkFollowers from "./checkFollowers";
import sendWelcomeMessage from "./sendWelcomeMessage";
import notifyUser from "./notifyUser";
import cacheUsername from "./getFollowerInfos";
import createTwitterTasks from "./createTwitterTasks";

const tasks: {[taskName: string]: ProcessCallback} = {
    checkFollowers,
    notifyUser,
    sendWelcomeMessage,
    cacheUsername,
    createTwitterTasks,
};

export const customRateLimits: {[taskName: string]: number} = {
    cacheUsername: 1, // avoid concurrency
};

export default tasks;