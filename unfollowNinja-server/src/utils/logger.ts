import { worker } from 'cluster';
import { createLogger, format, transports } from 'winston';

const workerInfo = worker ? `work ${worker.id}` : 'master';

const customFormat = format.combine(
    format.timestamp(),
    format.splat(),
    format.printf((info) => `${info.timestamp} ${workerInfo} ${info.level}: ${info.message}`),
);

const fileParams = {
    maxsize: 5000000, // 5MB
    maxFiles: 200,
};

const logger = createLogger({
    format: customFormat,
    transports: [
        new transports.Console({
            format: format.combine(format.colorize(), customFormat),
            level: 'debug',
        }),
        new transports.File({
            ...fileParams,
            filename: 'logs/info.log',
            level: 'info',
        }),
        new transports.File({
            ...fileParams,
            filename: 'logs/error.log',
            level: 'error',
        }),
        new transports.File({
            ...fileParams,
            filename: 'logs/debug.log',
            level: 'debug',
        }),
    ],
    exceptionHandlers: [
        new transports.Console(),
        new transports.File({
            ...fileParams,
            filename: 'logs/exceptions.log',
        }),
    ],
});

if (typeof global.it === 'function') { // mocha
    logger.level = 'warn';
}

export default logger;
