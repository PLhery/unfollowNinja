import { gql } from 'apollo-server';

export const typeDefs = gql`
    enum Lang {
        fr
        en
    }

    type User {
        id: ID!
        username: String!
        added_at: Int! # in ms
        lang: Lang!
        category: Int! # enabled=0, suspended, revoked, disabled, dmclosed, accountClosed=5
        dmId: String
        dmUsername: String
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
