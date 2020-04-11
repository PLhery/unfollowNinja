import { worker } from 'cluster';
import * as fs from 'fs';
import { createLogger, format, transports } from 'winston';

let workerInfo = worker ? `work ${worker.id}` : 'master';
export const setLoggerPrefix = (prefix: string) => workerInfo = prefix + ' '.repeat(6 - prefix.length);

const customFormat = format.combine(
    format.timestamp(),
    format.splat(),
    format.printf((info) => `${info.timestamp} ${workerInfo} ${info.level}: ${info.message}`),
);

const fileParams = {
    maxsize: 20000000, // 20MB
    maxFiles: 200,
};

const testEnv = typeof it === 'function'; // jest

fs.exists( './logs', (exists) => !exists && fs.mkdir('./logs', () => null));

const logger = createLogger({
    format: customFormat,
    transports: [
        new transports.Console({
            format: format.combine(format.colorize(), customFormat),
            level: testEnv ? 'warn' : 'info',
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
        !testEnv && new transports.File({
            ...fileParams,
            filename: 'logs/warn.log',
            level: 'warn',
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
