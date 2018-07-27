import { worker } from 'cluster';
import { createLogger, format, transports } from 'winston';

const workerInfo = worker ? `work ${worker.id}` : 'master';

const customFormat = format.combine(
    format.colorize(),
    format.timestamp(),
    format.splat(),
    format.printf((info) => `${info.timestamp} ${workerInfo} ${info.level}: ${info.message}`),
);

const logger = createLogger({
    format: customFormat,
    level: 'debug',
    transports: [ new transports.Console() ],
    exceptionHandlers: [ new transports.Console() ],
});

if (typeof global.it === 'function') { // mocha
    logger.level = 'warn';
}

export default logger;
