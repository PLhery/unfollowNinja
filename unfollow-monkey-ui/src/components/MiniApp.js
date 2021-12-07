import React, {useEffect, useState} from 'react';
import {Box, Button, Paragraph} from "grommet";
import {Alert, Twitter, ChatOption, UserExpert, Validate} from "grommet-icons";
import Confetti from 'react-dom-confetti';

import Styles from './MiniApp.module.scss';
import Link from "./Link";
import LanguageSelector from "./MiniApp/LanguageSelector";
import ProCard from "./MiniApp/ProCard";

export const API_URL = 'https://api.unfollow-monkey.com';

const LoggedInIntro = ({ user, logout, removeDMs, changeLang, setUserInfo, setHasError }) => {
    if (!user?.username) return null; // not logged in

    let message = <Paragraph>One more step to activate the service:<br/> Choose an account to send you notifications</Paragraph>;
	if (user.category === 2) { // revoked tokens
	  	message = <Paragraph>It seems that your Twitter account has been deactivated:<br/> Log in again to reactivate the service.</Paragraph>;
	}
    if (user.dmUsername) {
        message = <Paragraph>All clear! Don't forget to follow <Link href='https://twitter.com/unfollowmonkey' source='logged-in-intro'>@unfollowMonkey</Link></Paragraph>;
    }
    if (user.dmUsername && user.dmUsername !== user.username) {
        message = <Paragraph>All clear, <b>@{user.dmUsername}</b> will notify you by DM!
            Don't forget to follow <Link href='https://twitter.com/unfollowmonkey' source='logged-in-intro'>@unfollowMonkey</Link></Paragraph>;
    }
    return <div className={Styles.loggedInDetails}>
        <Paragraph>{user.dmUsername && <Validate color='neutral-1' className={Styles.centerIcon}/>} Welcome, <b>@{user.username}</b>!</Paragraph>
        {message}
	  {user.dmUsername && <LanguageSelector value={user.lang} onChange={changeLang}/> }
	  {user.dmUsername && <ProCard user={user} setUserInfo={setUserInfo} setHasError={setHasError}/> }

        <Paragraph>
            <Link href='#' onClick={e => {logout();e.preventDefault();}} source='disconnect'>Log out</Link>
            {user.dmUsername && <> — <Link href='#' onClick={e => {removeDMs();e.preventDefault();}} source='disable'>Disable the service</Link></>}
		  	<> — <Link href='#' onClick={e => {window.$crisp?.push(["do", "chat:open"]);e.preventDefault();}} source='talktous'>Talk with us</Link></>
        </Paragraph>
    </div>
};

function MiniApp(props) {
  const [userInfo, setUserInfo] = useState(null);
  const [hasError, setHasError] = useState(false);

  // persist the userInfo in sessionStorage
  useEffect(() => { userInfo && sessionStorage.setItem('userInfo', JSON.stringify(userInfo)) }, [userInfo]);

  // send the user's username and info to the support chatbot
  useEffect(() => {
	if (userInfo?.username) {
	  window.$crisp?.push(['set', 'session:data', [
		Object.entries(userInfo)
		  .map(kv => ['string', 'number', 'boolean'].includes(typeof kv[1]) ? kv : [kv[0], JSON.stringify(kv[1])]),
	  ]]);
	}
  }, [userInfo]);

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
		.then(data => setUserInfo(data))
		.catch(() => {
		  setHasError(true)
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
	window.$crisp?.push(['set', 'session:event', [[['logout']]]]);
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
	window.crisp?.push(['set', 'session:event', [[['removeDms']]]]);
  };
  const changeLang = (newLang) => {
	setUserInfo({
	  ...userInfo,
	  lang: newLang,
	});
	fetch(API_URL + '/user/lang', {
	  method: 'put',
	  credentials: 'include',
	  headers: { 'Content-Type': 'application/json' },
	  body: JSON.stringify({lang: newLang})
	})
	  .then(response => response.ok || Promise.reject())
	  .catch(() => {
		setUserInfo(userInfo);
		setHasError(true)
	  });
	window.$crisp?.push(['set', 'session:event', [[['changeLang', { old: userInfo.lang, new: newLang}]]]]);
  }
  // Listen and process postmessages from the API
  // (these are sent in the log in callback page)
  useEffect(() => {
    const processMessage = (event) => {
      if (event.origin !== API_URL) {
		return;
	  }
      const content = JSON.parse(decodeURI(event.data.content));
	  setUserInfo(content);
	  window.$crisp?.push(['set', 'session:event', [[[event.data.msg]]]]);
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
        {hasError ?
		  <Paragraph textAlign='center'><Alert/><br/>Unable to reach the server, try again later...</Paragraph> :
		  <>
			<Confetti active={step2} className={Styles.confettis}/>
			<LoggedInIntro {...{user: userInfo, setUserInfo, changeLang, removeDMs, logout, setHasError}}/>
		  </>
        }
        <Button
            icon={<Twitter color={step0 ? 'white' : null}/>}
            label='Login to your account'
            primary={step0}
            style={step0 ? {color: 'white'} : {}}
            disabled={!step0 || hasError}
            href={`${API_URL}/auth/step-1`}
			target='_blank'
			rel='opener'
        />
        <Button
            icon={<ChatOption color={step1 ? 'white' : null}/>}
            label={step2 ? 'Change the account that sends the DMs' : 'Enable DM notifications'}
            primary={step1}
            style={step1 ? {color: 'white'} : {}}
            disabled={step0 || hasError}
			href={(step0 || hasError) ? null : (step2 ? `${API_URL}/auth/step-2?force_login=true` : `${API_URL}/auth/step-2`)}
			target='_blank'
			rel='opener'
        />
        <Button
            icon={<UserExpert color={step2 ? 'white' : null}/>}
            label={'Follow @UnfollowMonkey'}
            primary={step2}
            style={step2 ? {color: 'white'} : {}}
            href='https://twitter.com/unfollowmonkey'
            target='_blank'
            rel='noopener'
        />
      </Box>
  );
}

export default MiniApp;