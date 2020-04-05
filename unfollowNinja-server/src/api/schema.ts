import { gql } from 'apollo-server';

export const typeDefs = gql`
    type User {
        id: ID!
        username: String!
        dmAccountUsername: String
    }

    type CurrentState {
        id: ID!
        user: User
        twitterStep1AuthUrl: String
        twitterStep2AuthUrl: String
    }

    type Query {
        info: CurrentState
        me: User
        twitterStep1AuthUrl: String
        twitterStep2AuthUrl: String
    }

    type Mutation {
        login(token: String!, verifier: String!): CurrentState
        addDmAccount(token: String!, verifier: String!): User
        removeDmAccount: User
        logout: CurrentState
    }
`;
