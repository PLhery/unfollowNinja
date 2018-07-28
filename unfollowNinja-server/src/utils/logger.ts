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

const testEnv = typeof it === 'function'; // jest

const logger = createLogger({
    format: customFormat,
    transports: [
        new transports.Console({
            format: format.combine(format.colorize(), customFormat),
            level: testEnv ? 'warn' : 'debug',
        }),
        !testEnv && new transports.File({
            ...fileParams,
            filename: 'logs/info.log',
            level: 'info',
        }),
        !testEnv && new transports.File({
            ...fileParams,
            filename: 'logs/error.log',
            level: 'error',
        }),
        !testEnv && new transports.File({
            ...fileParams,
            filename: 'logs/debug.log',
            level: 'debug',
        }),
    ].filter(t => t),
    exceptionHandlers: [
        new transports.Console(),
        !testEnv && new transports.File({
            ...fileParams,
            filename: 'logs/exceptions.log',
        }),
    ].filter(t => t),
});

export default logger;
