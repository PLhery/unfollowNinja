import React, { useState } from 'react';
import {Box, Button, Paragraph} from "grommet/es6";
import {Twitter, ChatOption, UserExpert} from "grommet-icons";
import { useHistory, useLocation } from "react-router-dom";

import { useQuery, useMutation, gql } from '@apollo/client';

const GET_INFO = gql`
    {
        twitterStep1AuthUrl,
        twitterStep2AuthUrl,
        me {username, id}
    }
`;

const LOGIN = gql`
    mutation Login($oauthToken: String!, $oauthVerifier: String!) {
        login(token: $oauthToken, verifier: $oauthVerifier) {
            twitterStep2AuthUrl,
            me {username, id}
        }
    }
`;

export default (props) => {
  const location = useLocation();
  const [loggingIn, setLoggingIn] = useState(false);
  const [login, loggingInAnswer] = useMutation(LOGIN);

  if (!loggingIn && location.pathname === '/1') {
    const urlParams = new URLSearchParams(location.search);
    const [ oauthToken, oauthVerifier ] = [ urlParams.get('oauth_token'), urlParams.get('oauth_verifier') ];
    if (oauthToken && oauthVerifier) {
      setLoggingIn(true);
      login({variables: {oauthToken, oauthVerifier}});
      useHistory().push('/');
      return;
    }
  }

  let { loading, error, data } = loggingIn ? loggingInAnswer : useQuery(GET_INFO);
  data = data?.login || data;
  const step1 = !data?.twitterStep2AuthUrl;

  return (
      <Box gap='small' margin={{horizontal: 'small', vertical: 'medium'}} {...props}>
        {error ? <Paragraph>Impossible de joindre le serveur, réessayez plus tard...</Paragraph> : null}
        <Button
            icon={<Twitter color={step1 ? 'white' : null}/>}
            label='Connectez-vous à votre compte'
            primary={step1}
            style={step1 ? {color: 'white'} : {}}
            disabled={!data?.twitterStep1AuthUrl || !step1}
            href={data?.twitterStep1AuthUrl}
        />
        <Button
            icon={<ChatOption color={!step1 ? 'white' : null}/>}
            label='Activez les notifications par DM'
            primary={!step1}
            style={!step1 ? {color: 'white'} : {}}
            disabled={step1}
            href={data?.twitterStep2AuthUrl}
        />
        <Button
            icon={<UserExpert/>}
            label={'Suivez @UnfollowNinja'}
            href='https://twitter.com/unfollowninja'
            target='_blank'
            rel='noopener'
            disabled={step1}
        />
      </Box>
  );
}
