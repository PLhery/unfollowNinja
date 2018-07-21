import {ProcessCallback} from "kue";

import checkFollowers from "./checkFollowers";
import sendWelcomeMessage from "./sendWelcomeMessage";
import notifyUser from "./notifyUser";
import cacheUsername from "./getFollowerInfos";

const tasks: {[taskName: string]: ProcessCallback} = {
    checkFollowers,
    notifyUser,
    sendWelcomeMessage,
    cacheUsername,
};

export const customRateLimits: {[taskName: string]: number} = {
    cacheUsername: 1, // avoid concurrency
};

export default tasks;