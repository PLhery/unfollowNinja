import React from 'react';
import {Box, Button, Paragraph} from "grommet/es6";
import {Alert, Twitter, ChatOption, UserExpert, Validate} from "grommet-icons";
import { useHistory, useLocation } from "react-router-dom";
import Confetti from 'react-dom-confetti';
import { useQuery, useMutation, gql } from '@apollo/client';

import Styles from './MiniApp.module.scss';
import Link from "./Link";

const GET_INFO = gql`
    {
        info {
            id,
            twitterStep1AuthUrl,
            twitterStep2AuthUrl,
            user {id, username, dmUsername, category}
        }
    }
`;

const LOGIN = gql`
    mutation Login($oauthToken: String!, $oauthVerifier: String!) {
        login(token: $oauthToken, verifier: $oauthVerifier) {
            id,
            twitterStep1AuthUrl,
            twitterStep2AuthUrl,
            user {id, username, dmUsername, category}
        }
    }
`;

const ADD_DMS = gql`
    mutation AddDms($oauthToken: String!, $oauthVerifier: String!) {
        addDmAccount(token: $oauthToken, verifier: $oauthVerifier) {id, username, dmUsername}
    }
`;

const REMOVE_DMS = gql`
    mutation RemoveDms {
        removeDmAccount {id, username, dmUsername, category}
    }
`;

const LOGOUT = gql`
    mutation Logout {
        logout {
            id,
            twitterStep1AuthUrl,
            twitterStep2AuthUrl,
            user {id, username, dmUsername, category}
        }
    }
`;

const LoggedInIntro = ({ user, logout, removeDMs }) => {
    if (!user) return null; // not logged in

    let message = <Paragraph>Plus qu'une étape pour activer le service :<br/> Choisissez un compte pour vous envoyer les notifications</Paragraph>;
    if (user.category === 2) { // revoked tokens
        message = <Paragraph>Il semble que votre compte Twitter a été désactivé :<br/> Reconnectez vous à l'étape deux pour réactiver le service</Paragraph>;
    }
    if (user.dmUsername) {
        message = <Paragraph>Tout est en ordre ! N'oubliez pas de suivre <Link href='https://twitter.com/unfollowninja' source='logged-in-intro'>@unfollowNinja</Link></Paragraph>;
    }
    if (user.dmUsername && user.dmUsername !== user.username) {
        message = <Paragraph>Tout est en ordre, <b>@{user.dmUsername}</b> vous préviendra par DM !
            N'oubliez pas de suivre <Link href='https://twitter.com/unfollowninja' source='logged-in-intro'>@unfollowNinja</Link></Paragraph>;
    }
    return <div className={Styles.loggedInDetails}>
        <Paragraph><Validate color='neutral-1' className={Styles.centerIcon}/> Bienvenue, <b>@{user.username}</b> !</Paragraph>
        {message}
        <Paragraph>
            <Link href='#' onClick={e => {logout();e.preventDefault();}} source='disconnect'>Se déconnecter</Link>
            {user.dmUsername ? <span> — <Link href='#' onClick={e => {removeDMs();e.preventDefault();}} source='disable'>Désactiver le service</Link>
            </span> : null}
        </Paragraph>
    </div>
};

function sendStep3Event() {
    if (window.gtag) {
        window.gtag('event', 'click', {
            'event_category': 'outbound',
            'event_label': 'step 3',
        });
    }
}

export default (props) => {
  const location = useLocation();

  const [login, loginRequest] = useMutation(LOGIN);
  const [addDms, addDmsRequest] = useMutation(ADD_DMS);
  const [removeDMs] = useMutation(REMOVE_DMS);
  const [logout] = useMutation(LOGOUT);
  let { error, data, refetch } = useQuery(GET_INFO);
  data = data?.info;
  error = error || loginRequest.error || addDmsRequest.error;
  if (navigator.userAgent === 'ReactSnap') {
      data = null; // ReactSnap should capture a loading state
  }

  if (!loginRequest.called && location.pathname === '/1') {
    const urlParams = new URLSearchParams(location.search);
    const [ oauthToken, oauthVerifier ] = [ urlParams.get('oauth_token'), urlParams.get('oauth_verifier') ];
    if (oauthToken && oauthVerifier) { // otherwise, probably denied
        login({variables: {oauthToken, oauthVerifier}});
        setTimeout(() => window.gtag && window.gtag('event', 'login'), 1000); // ganalaytics
    } else {
        setTimeout(() => window.gtag && window.gtag('event', 'exception', {description: 'login_failed'}), 1000);
    }
    useHistory().push('/');
  } else if (!addDmsRequest.called && location.pathname === '/2') {
      const urlParams = new URLSearchParams(location.search);
      const [ oauthToken, oauthVerifier ] = [ urlParams.get('oauth_token'), urlParams.get('oauth_verifier') ];
      if (oauthToken && oauthVerifier) { // otherwise, probably denied
          addDms({variables: {oauthToken, oauthVerifier}});
          setTimeout(() => window.gtag && window.gtag('event', 'sign_up'), 1000); // ganalaytics
      } else {
          setTimeout(() => window.gtag && window.gtag('event', 'exception', {description: 'add_dms_failed'}), 1000);
      }
      useHistory().push('/');
  }

  const step0 = !data?.user && !addDmsRequest.loading && !loginRequest.loading; // not logged in or loading
  const step1 = data?.user && !data.user.dmUsername; // logged in but no DM account
  const step2 = !!data?.user?.dmUsername; // logged in and have a DM account

  return (
      <Box gap='small' margin={{horizontal: 'small', vertical: 'medium'}} {...props}>
        {error ? <Paragraph textAlign='center'><Alert/><br/>Impossible de joindre le serveur, réessayez plus tard...</Paragraph> : null}
        <Confetti active={step2} className={Styles.confettis}/>
        <LoggedInIntro user={data?.user} logout={logout} removeDMs={removeDMs} getInfo={refetch}/>
        <Button
            icon={<Twitter color={step0 ? 'white' : null}/>}
            label='Connectez-vous à votre compte'
            primary={step0}
            style={step0 ? {color: 'white'} : {}}
            disabled={!data?.twitterStep1AuthUrl || !step0}
            href={data?.twitterStep1AuthUrl}
        />
        <Button
            icon={<ChatOption color={step1 ? 'white' : null}/>}
            label={step2 ? 'Changer le compte d\'envoi de DMs' : 'Activez les notifications par DM'}
            primary={step1}
            style={step1 ? {color: 'white'} : {}}
            disabled={!data?.twitterStep2AuthUrl || step0}
            href={step2 ? data.twitterStep2AuthUrl?.replace('oauth/authenticate', 'oauth/authorize') : data?.twitterStep2AuthUrl}
        />
        <Button
            icon={<UserExpert color={step2 ? 'white' : null}/>}
            label={'Suivez @UnfollowNinja'}
            primary={step2}
            style={step2 ? {color: 'white'} : {}}
            href='https://twitter.com/unfollowninja'
            onClick={sendStep3Event}
            target='_blank'
            rel='noopener'
        />
      </Box>
  );
}
