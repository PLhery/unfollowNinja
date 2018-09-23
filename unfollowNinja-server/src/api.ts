import 'dotenv/config';

import * as express from 'express';
import logger, { setLoggerPrefix } from './utils/logger';

setLoggerPrefix('api');
const API_PORT = Number(process.env.API_PORT) || 2000;

const app = express();

const router = express.Router();

router.get('/', (req, res) => {
    res.json({message: 'Unfollow ninja API is up!'});
});

app.use('/v1', router);
app.listen(API_PORT);
logger.info(`Unfollow ninja API is now listening on port ${API_PORT}`);