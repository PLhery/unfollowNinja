import cluster from 'cluster';
import * as fs from 'fs';
import { createLogger, format, transports } from 'winston';

let workerInfo = cluster.worker ? `work ${cluster.worker.id}` : 'master';
export const setLoggerPrefix = (prefix: string) => (workerInfo = prefix + ' '.repeat(6 - prefix.length));

const customFormat = format.combine(
    format.timestamp(),
    format.splat(),
    format.errors({ stack: true }),
    format.printf((info) => `${info.timestamp} ${workerInfo} ${info.level}: ${info.message}`)
);

const fileParams = {
    maxsize: 50000000, // 50MB
    maxFiles: 10,
    tailable: true,
};

const testEnv = typeof it === 'function'; // jest

fs.exists('./logs', (exists) => !exists && fs.mkdir('./logs', () => null));

const logger = createLogger({
    format: customFormat,
    transports: [
        new transports.Console({
            format: format.combine(format.colorize(), customFormat),
            level: testEnv ? 'warn' : 'info',
        }),
        !testEnv &&
            new transports.File({
                ...fileParams,
                filename: 'logs/error.log',
                level: 'error',
            }),
        !testEnv &&
            new transports.File({
                ...fileParams,
                filename: 'logs/warn.log',
                level: 'warn',
            }),
        !testEnv &&
            new transports.File({
                ...fileParams,
                filename: 'logs/info.log',
                level: 'info',
            }),
        !testEnv &&
            new transports.File({
                ...fileParams,
                filename: 'logs/debug.log',
                level: 'debug',
            }),
    ].filter((t) => t),
    exceptionHandlers: [
        new transports.Console(),
        !testEnv &&
            new transports.File({
                ...fileParams,
                filename: 'logs/exceptions.log',
            }),
    ].filter((t) => t),
});

export default logger;
