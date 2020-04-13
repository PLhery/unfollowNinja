import 'dotenv/config';

import * as Sentry from '@sentry/node';
import kue from 'kue';
import { ApolloServer, AuthenticationError } from 'apollo-server';

import resolvers from './api/resolvers';
import { typeDefs } from './api/schema';
import logger, { setLoggerPrefix } from './utils/logger';
import Dao from './dao/dao';

setLoggerPrefix('api');

const SENTRY_DSN = process.env.SENTRY_DSN_API || undefined;
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
    return { uid, session, setSession, dao, queue, req };
};

// sentry integration
// from https://gist.github.com/nodkz/d14b236d67251d2df5674cb446843732
const apolloServerSentryPlugin = SENTRY_DSN ? {
    requestDidStart() {
        return {
            didEncounterErrors(rc) {
                Sentry.withScope((scope) => {
                    scope.addEventProcessor((event) =>
                        Sentry.Handlers.parseRequest(event, (rc.context as any).req)
                    );

                    // username
                    const username = (rc.context as any).session?.user?.username;
                    if (username) {
                        scope.setUser({
                            ip_address: (rc.context as any).req?.ip,
                            username,
                        });
                    }

                    scope.setTags({
                        graphql: rc.operation?.operation || 'parse_err',
                        graphqlName: (rc.operationName as any) || (rc.request.operationName as any),
                    });

                    rc.errors.forEach((error) => {
                        if (error.path || error.name !== 'GraphQLError') {
                            scope.setExtras({
                                path: error.path,
                            });
                            Sentry.captureException(error);
                        } else {
                            scope.setExtras({});
                            Sentry.captureMessage(`GraphQLWrongQuery: ${error.message}`);
                        }
                    });
                });
            },
        };
    },
} : {};

const server = new ApolloServer({
    typeDefs, resolvers, context, plugins: [apolloServerSentryPlugin], introspection: false, playground: false, debug: false
});

server.listen().then(({ url }: { url: string }) => {
    logger.info(`🚀 Server ready at ${url}`);
});
