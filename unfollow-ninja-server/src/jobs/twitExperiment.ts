import 'dotenv/config';

import Dao from '../dao/dao';
import logger from '../utils/logger';

async function run() {
    const dao = await new Dao().load();
    const userDao = dao.getUserDao('290981389'); // plhery 290981389
    const twitterApi = await userDao.getDmTwitterApi();
    // play with twit
    await twitterApi.v2
        .followers('290981389', { max_results: 1 })
        .then((result) => {
            console.log(result);
        })
        .catch((err) => {
            console.log(err, err.data, err.message);
        });

    await dao.disconnect();
}
run().catch((error) => logger.error(error.stack));
