import 'dotenv/config';

import { ApolloServer, AuthenticationError } from 'apollo-server';
import resolvers from './api/resolvers';
import { typeDefs } from './api/schema';
import logger, { setLoggerPrefix } from './utils/logger';

setLoggerPrefix('api');

const context = ({req}) => {
    const { uid } = req.headers;
    if (!uid) {
        throw new AuthenticationError('uid required');
    }
    return { uid };
};
const server = new ApolloServer({ typeDefs, resolvers, context, introspection: false, playground: false});

server.listen().then(({ url }: { url: string }) => {
    logger.info(`🚀 Server ready at ${url}`);
});
