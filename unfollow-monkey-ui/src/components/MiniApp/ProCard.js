import React, {useState} from 'react';
import {Button, Card, Image, Paragraph, TextInput} from "grommet";

import Styles from './ProCard.module.scss';
import {applePay, googlePay, mastercard} from "../../images";
import { API_URL } from "../MiniApp";
import Link from "../Link";

function ProCard(props) {
  const { user, setUserInfo, setHasError } = props;

  const [isWrongCode, setIsWrongCode] = useState(false);

  const codeChanged = (event) => {
	const newCode = event.target.value;
	if (isWrongCode) {
	  setIsWrongCode(false);
	}
	if (newCode.length !== 6) {
	  return;
	}
	fetch(API_URL + '/user/registerFriendCode', {
	  method: 'put',
	  credentials: 'include',
	  headers: { 'Content-Type': 'application/json' },
	  body: JSON.stringify({code: newCode.toUpperCase()})
	})
	  .then(response => {
		console.log(response);
		if (response.ok) {
		  setUserInfo({
			...user,
			isPro: true,
		  });
		} else if (response.status === 404) {
		  setIsWrongCode(true);
	  	} else {
		  return Promise.reject();
		}
	  })
	  .catch((e) => {
		setHasError(true);
	  });
	window.$crisp?.push(['set', 'session:event', [[['tryCode', { code: newCode}]]]]);
  }

  if (user.isPro) {
	return <Card className={Styles.checkoutCard}>
	  <Paragraph>
		Congratulations, you can now enjoy UMonkey <b className={Styles.pro}>pro</b><br/>
		You will be notified in <b>30sec</b> instead of 30min 🚀<br/>
		{user.hasSubscription && <Link href={`${API_URL}/user/manage-subscription`} className={Styles.subscriptionLink}>Manage subscription</Link>}
	  </Paragraph>
	  { user.friendCodes && <>
		<Paragraph margin={{bottom: 'none'}}>You can also share these codes, thx to the <b className={Styles.pro}>friends</b> plan:</Paragraph>
		<ul style={{marginTop: 0}}>
		{
		  user.friendCodes?.map(code =>
			<li><b>{code.code}</b> - {
			  code.friendUsername ?
				<i>used by <b>@{code.friendUsername}</b>{/*<Button plain={true} icon={<Trash size='small'/>}/>*/}</i> :
				<i>not used yet</i>
			}</li>
		  )
		}
		</ul>
	  </>}
	</Card>
  } else {
	return <Card className={Styles.checkoutCard}>
		<Paragraph>
			You currently receive your notifications in <b>1 hour</b><br/>
			Become <b className={Styles.pro}>pro</b> to be notified in <b>30 seconds</b>!<br/>
		</Paragraph>
		<Paragraph>Valid on <b>5 Twitter accounts</b> - {user.priceTags.friends}/year</Paragraph>
		<small>10 days trial - easily cancel online</small>
		<Button
		  className={Styles.checkoutButton}
		  href={`${API_URL}/user/buy-friends`}
		  label={<>
		  <Image className={Styles.googlePayIcon} src={googlePay} alt='Google pay'/>
		  <Image height={26} src={applePay} alt='Apple pay'/>
		  <Image height={26} src={mastercard} alt='Mastercard'/>
		  <span>Pay with Stripe</span>
		</>}/>
		<div className={Styles.friendCodeLine + (isWrongCode ? ' ' + Styles.error : '')}>
		  <Paragraph>Use a friend code:</Paragraph><TextInput maxLength={6} onChange={codeChanged}/>
		</div>
	</Card>
  }

}

export default ProCard;