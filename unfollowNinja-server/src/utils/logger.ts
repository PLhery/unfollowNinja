import { createLogger, format, transports } from 'winston';
import { worker } from "cluster";

const workerInfo = worker ? `work ${worker.id}` : 'master';

const logger = createLogger({
    transports: [ new transports.Console() ],
    exceptionHandlers: [ new transports.Console() ],
    format: format.combine(
        format.colorize(),
        format.timestamp(),
        format.splat(),
        format.printf(info => `${info.timestamp} ${workerInfo} ${info.level}: ${info.message}`)
    ),
});

if (typeof global.it === 'function') { // mocha
    // logger.level = 'warn';
    logger.warn('hey');
    logger.info('heyyy');
}

export default logger;