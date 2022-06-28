import 'dotenv/config';

import Dao from '../dao/dao';
import logger from '../utils/logger';

async function run() {
    const dao = await new Dao().load();
    const userDao = dao.getUserDao('290981389'); // plhery
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const twit = await userDao.getTwit();
    // play with twit
}
run().catch((error) => logger.error(error.stack));
