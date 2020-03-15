import { gql } from 'apollo-server';

export const typeDefs = gql`
    type User {
        token: String!
        secret: String!
        id: ID!
        username: String!
    }

    type LoginResult {
        me: User!
        twitterStep1AuthUrl: String!
        twitterStep2AuthUrl: String!
    }

    type Query {
        me: User
        twitterStep1AuthUrl: String
        twitterStep2AuthUrl: String
    }

    type Mutation {
        login(token: String!, verifier: String!): LoginResult
    }
`;
