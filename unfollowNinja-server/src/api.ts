import 'dotenv/config';

import * as Sentry from '@sentry/node';
import kue from 'kue';
import { ApolloServer, AuthenticationError } from 'apollo-server';

import resolvers from './api/resolvers';
import { typeDefs } from './api/schema';
import logger, { setLoggerPrefix } from './utils/logger';
import Dao from './dao/dao';

setLoggerPrefix('api');

const SENTRY_DSN = process.env.SENTRY_DSN || undefined;
if (SENTRY_DSN) {
    Sentry.init({ dsn: SENTRY_DSN });
}

const dao = new Dao();
const queue = kue.createQueue({redis: process.env.REDIS_KUE_URI});

const context = async ({req}) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    logger.info(ip + ' - ' + JSON.stringify(req.body.query, null, null));
    const { uid } = req.headers;
    if (!uid) {
        throw new AuthenticationError('uid required');
    }
    const session = await dao.getSession(uid);
    const setSession = (data) => dao.setSession(uid, data);
    return { uid, session, setSession, dao, queue };
};

const server = new ApolloServer({
    typeDefs, resolvers, context, introspection: false, playground: false, debug: false
});

server.listen().then(({ url }: { url: string }) => {
    logger.info(`🚀 Server ready at ${url}`);
});
