import React, {useEffect, useState} from 'react';
import {Box, Button, Paragraph} from "grommet/es6";
import {Alert, Twitter, ChatOption, UserExpert, Validate} from "grommet-icons";
import Confetti from 'react-dom-confetti';

import Styles from './MiniApp.module.scss';
import Link from "./Link";

const API_URL = 'https://api.unfollow.ninja';

const LoggedInIntro = ({ user, logout, removeDMs }) => {
    if (!user?.username) return null; // not logged in

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

function MiniApp(props) {
  const [userInfo, setUserInfo] = useState(null);
  const [hasError, setHasError] = useState(false);

  let notFrench =
	!navigator.language?.startsWith?.('fr') &&
	navigator.userAgent !== 'ReactSnap' &&
	userInfo?.country &&
	!['FR', 'BE', 'CA', 'CH'].includes(userInfo.country);

  notFrench = true;

  // persist the userInfo in sessionStorage
  useEffect(() => { userInfo && sessionStorage.setItem('userInfo', JSON.stringify(userInfo)) }, [userInfo]);

  useEffect(() => {
	if (navigator.userAgent !== "ReactSnap") { // We don't want to risk hasError=true on ReactSnap
	  // first: load userInfo from the sessionStorage
	  const storedUserInfo = JSON.parse(sessionStorage.getItem('userInfo'));
	  if (storedUserInfo?.username) { // logged in user
		setUserInfo(storedUserInfo);
	  }

	  // second: load it more accurately from the server
	  fetch(API_URL + '/get-status', {credentials: 'include'})
		.then(response => response.ok ? response.json() : null)
		.then(data => data || Promise.reject())
		.then(data => setUserInfo(data.country ? data : null))
		.catch(() => {
		  // setHasError(true)
		})
	}
  }, []);

  const logout = () => {
	setUserInfo({});
    fetch(API_URL + '/user/logout', {method: 'post',credentials: 'include'})
	  .then(response => response.ok || Promise.reject())
	  .catch(() => {
	    setUserInfo(userInfo);
	    setHasError(true)
	  })
  };
  const removeDMs = () => {
	setUserInfo({
	  ...userInfo,
	  dmUsername: null,
	  category: 3, // disabled
	});
	fetch(API_URL + '/user/disable', {method: 'post',credentials: 'include'})
	  .then(response => response.ok || Promise.reject())
	  .catch(() => {
		setUserInfo(userInfo);
		setHasError(true)
	  });
  };

  // Listen and process postmessages from the API
  // (these are sent in the log in callback page)
  useEffect(() => {
    const processMessage = (event) => {
      if (event.origin !== API_URL) {
		return;
	  }
      const content = JSON.parse(decodeURI(event.data.content));
	  setUserInfo(content);
	}

	window.addEventListener('message', processMessage);
    return function cleanup() {
      window.removeEventListener('message', processMessage);
	};
  }, [])

  const step0 = !userInfo?.username; // not logged in
  const step1 = userInfo?.username && !userInfo.dmUsername; // logged in but no DM account
  const step2 = !!userInfo?.dmUsername; // logged in and have a DM account

  return (
      <Box gap='small' margin={{horizontal: 'small', vertical: 'medium'}} {...props}>
		{notFrench &&
		  <Paragraph textAlign='center'>
			<Alert/><br/>Sorry, only French-speaking users can create an account. <br/>
			Please use <Link href='https://unfollow-monkey.com/?utm_source=unfollowninja_warning'>https://unfollow-monkey.com</Link> instead. <br/>
			You can <Link rel='opener' href={`${API_URL}/auth/step-1`}>log in</Link> to disable your account if you'd like.
		  </Paragraph>
		}
        {hasError ?
		  <Paragraph textAlign='center'><Alert/><br/>Impossible de joindre le serveur, réessayez plus tard...</Paragraph> :
		  <>
			<Confetti active={step2 } className={Styles.confettis}/>
			<LoggedInIntro user={userInfo} logout={logout} removeDMs={removeDMs}/>
		  </>
        }
        <Button
            icon={<Twitter color={step0 ? 'white' : null}/>}
            label='Connectez-vous à votre compte'
            primary={step0}
            style={step0 ? {color: 'white'} : {}}
            disabled={!step0 || hasError || notFrench}
            href={`${API_URL}/auth/step-1`}
			target='_blank'
			rel='opener'
        />
        <Button
            icon={<ChatOption color={step1 ? 'white' : null}/>}
            label={step2 ? 'Changer le compte d\'envoi de DMs' : 'Activez les notifications par DM'}
            primary={step1}
            style={step1 ? {color: 'white'} : {}}
            disabled={step0 || hasError || notFrench}
			href={(step0 || hasError || notFrench) ? null : (step2 ? `${API_URL}/auth/step-2?force_login=true` : `${API_URL}/auth/step-2`)}
			target='_blank'
			rel='opener'
        />
        <Button
            icon={<UserExpert color={step2 ? 'white' : null}/>}
            label={'Suivez @UnfollowNinja'}
            primary={step2}
            style={step2 ? {color: 'white'} : {}}
            href='https://twitter.com/unfollowninja'
            target='_blank'
            rel='noopener'
        />
      </Box>
  );
}

export default MiniApp;