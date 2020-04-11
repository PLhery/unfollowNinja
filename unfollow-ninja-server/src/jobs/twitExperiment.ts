import 'dotenv/config';

import { get } from 'lodash';
import { Params } from 'twit';
import Dao from '../dao/dao';

const dao = new Dao();
const userDao = dao.getUserDao('290981389'); // plhery
userDao.getTwit().then(async (twit) => {
    // play with twit
});
