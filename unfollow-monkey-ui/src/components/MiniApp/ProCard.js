import React from 'react';
import {Button, Card, Paragraph, Image} from "grommet";

import Styles from './ProCard.module.scss';
import {applePay, googlePay, mastercard} from "../../images";
import { API_URL } from "../MiniApp";
import Link from "../Link";

function ProCard(props) {
  const { user } = props;

  if (user.isPro) {
	return <Card className={Styles.checkoutCard}>
	  <Paragraph>
		Congratulations, you can now enjoy UMonkey <b className={Styles.pro}>pro</b> 🚀<br/>
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
			One last step to receive your notifications:<br/>
			Become a <b className={Styles.pro}>pro</b> user - for {user.priceTags.pro}/month<br/>
		</Paragraph>
		<Button
		  className={Styles.checkoutButton}
		  href={`${API_URL}/user/buy-pro`}
		  label={<>
		  <Image className={Styles.googlePayIcon} src={googlePay} alt='Google pay'/>
		  <Image height={26} src={applePay} alt='Apple pay'/>
		  <Image height={26} src={mastercard} alt='Mastercard'/>
		  <span>Pay with Stripe</span>
		</>}/>
	</Card>
  }

}

export default ProCard;