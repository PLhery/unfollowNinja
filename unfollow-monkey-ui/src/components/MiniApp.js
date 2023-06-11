import React, {useEffect, useState} from 'react';
import {
	Accordion,
	AccordionPanel,
	Box,
	Button,
	Paragraph,
	Spinner,
	Table,
	TableBody,
	TableCell, TableHeader,
	TableRow
} from "grommet";
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
	  	message = <Paragraph>It seems that your Twitter account has been deactivated:<br/> click on "Enable DM notifications" to reactivate the service.</Paragraph>;
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
	  {user.dmUsername && <Paragraph><small>Any issue with your pro subscription? <br/> Email us: <i>love@unfollow-monkey.com</i></small></Paragraph> }
		{user.dmUsername && <Paragraph><small>You don't receive your DMs? Read <Link href={'https://twitter.com/UnfollowMonkey/status/1589955137480818688'}>this thread</Link></small></Paragraph> }

        <Paragraph>
            <Link href='#' onClick={e => {logout();e.preventDefault();}} source='disconnect'>Log out</Link>
            {user.dmUsername && <> — <Link href='#' onClick={e => {removeDMs();e.preventDefault();}} source='disable'>Disable the service</Link></>}
        </Paragraph>
    </div>
};

/**
 * Adds html newlines, and bold twitter usernames
 */
function formatMessage(message) {
	const result = [];
	const parts = message.split(/(@\w{1,15})/g);
	for(let i = 0; i < parts.length; i+=2) {
		result.push(parts[i].split('\n').map(line => <>{line}<br/></>));
		result.push(<b>{parts[i+1]}</b>);
	}
	return result;
}

const MessagesAccordion = (latestMessages) => {
	return <Accordion>
		<AccordionPanel label="Last notifications sent">
			<Table>
				<TableHeader>
					<TableRow>
						<TableCell scope="col" border="bottom">
							Date and Time
						</TableCell>
						<TableCell scope="col" border="bottom">
							Message
						</TableCell>
					</TableRow>
				</TableHeader>
				<TableBody>
					{latestMessages ? latestMessages.map((message) =>
						<TableRow>
							<TableCell>
								<i>{new Date(message.sentAt).toLocaleString()}</i>
							</TableCell>
							<TableCell>{formatMessage(message.message)}</TableCell>
						</TableRow>
					) : <TableRow>
						<TableCell className={Styles.spinnerCell}>
							<Spinner />
						</TableCell>
						<TableCell><i>Chargement des messages...</i></TableCell>
					</TableRow>}
					{latestMessages?.length === 0 ?
						<TableRow>
							<TableCell>
							</TableCell>
							<TableCell><i>Aucune notification envoyée. Revenez plus tard!</i></TableCell>
						</TableRow> : null}
				</TableBody>
			</Table>
		</AccordionPanel>
	</Accordion>;
}

function MiniApp(props) {
  const [userInfo, setUserInfo] = useState(null);
  const [latestMessages, setLatestMessages] = useState(null);
  const [hasError, setHasError] = useState(false);

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
		.then(data => setUserInfo(data))
		.catch(() => {
		  setHasError(true)
		});
	}
  }, []);

	useEffect(() => {
		if (userInfo?.username) {
			fetch(API_URL + '/user/latest-notifications', {credentials: 'include'})
				.then(response => response.ok ? response.json() : null)
				.then(data => data || Promise.reject())
				.then(data => setLatestMessages(data))
				.catch((error) => {
					setLatestMessages(null);
					console.error(error);
				})
		}
	}, [userInfo?.username]);

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
<>
	  <Paragraph><i>As of April 2023, Twitter apps are not free anymore.<br/>To face this change, Unfollow Monkey will now cost {userInfo?.priceTags?.pro || '3$'}/month.</i></Paragraph>
	<Paragraph textAlign='center'><Alert/> [11-Jun-23] <br/>Unfollow Monkey is having an <Link href='https://twitter.com/UnfollowMonkey/status/1667710731263901697'>incident</Link> with DMs sent</Paragraph>
	<Box gap='small' margin={{horizontal: 'small', vertical: 'medium'}} {...props}>
        {hasError ?
		  <Paragraph textAlign='center'><Alert/><br/>Unable to reach the server, try again later...</Paragraph> :
		  <>
			<Confetti active={step2} className={Styles.confettis}/>
			<LoggedInIntro {...{user: userInfo, setUserInfo, changeLang, removeDMs, logout, setHasError}}/>
		    {userInfo?.username ? MessagesAccordion(latestMessages) : null}
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
            label={'Follow @UnfollowMonkey (optional)'}
            primary={step2}
            style={step2 ? {color: 'white'} : {}}
            href='https://twitter.com/unfollowmonkey'
            target='_blank'
            rel='noopener'
        />
      </Box>
</>
  );
}

export default MiniApp;
