import React from 'react';
import { Box, Heading, Paragraph } from "grommet/es6";
import Emojis from '../twemojis/Emojis';
import Styles from './Faq.module.scss';

function Faq(props) {
    return <Box alignSelf='center' pad='medium' margin='medium' className={Styles.container} {...props}>
            <Heading level={1} color='dark'>Frequently Asked Questions</Heading>

            <Heading level={3} color='dark'>A friend of mine unfollowed me, but I wasn't told</Heading>
            <Paragraph>To avoid disturbing you too often, several filters apply to the notifications sent.
                To be sure to get the notification, the person must have followed you for 24 hours and unfollow 20 minutes.</Paragraph>

            <Heading level={3} color='dark'>Will you publish tweets without my consent?</Heading>
            <Paragraph>We will never publish a tweet without your agreement! Only the DM account gives permission to send tweets.
                This is due to the way Twitter permissions work: there are only 3 sets of permissions, and we can't ask permission to send DMs without permission to send tweets.
                You can create a separate Twitter account dedicated to sending these messages if you wish.</Paragraph>

            <Heading level={3} color='dark'>Why does step 2 require so many permissions?</Heading>
            <Paragraph>As described above, this is due to the way Twitter permissions work: there are only 3 sets of permissions, and we can't request permission to send DMs without the others.
                We have never extracted these tokens to use them other than in this open-source application.
                You can create a separate Twitter account dedicated to sending these messages if you wish, for more serenity. A possibility of chrome notifications is under consideration :).
            </Paragraph>

            <Heading level={3} color='dark'>What do the different messages and emojis mean?</Heading>
            <ul>
                <li>The following messages speak for themselves:<ul>
                    <li><b>@username</b> unfollowed you <Emojis.WavingHand/></li>
                    <li><b>@username</b> has been suspended <Emojis.SeeNoEvil/></li>
                    <li><b>@username</b> blocked you <Emojis.NoEntry/></li>
                    <li>You have blocked <b>@username</b> <Emojis.Poo/></li>
                </ul></li>
                <li><b>@username</b> has left Twitter <Emojis.SeeNoEvil/> may mean that the person has been suspended for a few minutes, closed their account, or has been removed from Twitter for example because of the age limit.</li>
                <li>The emoji is a broken hear <Emojis.BrokenHeart/> if this person is a mutual, a person that you follow.</li>
                <li>If more than 20 twittos unfollow you in less than two minutes, you will only be informed of the first 20, as well as the total number of lost followers.</li>
                <li>"A twitto has left Twitter <Emojis.SeeNoEvil/>": when the username of the person who closed his account was not saved (may take 48 hours), you don't receive their username, but are informed of this lost follower.</li>
                <li>"This account followed you before you signed up to <b>@unfollowmonkey</b>!" : we can't always find the exact follow date of each unfollower.
                    If we can't find it, we give you the first time we saw it on your account. However, if they were already following you when you subscribed, we can't give you any date.</li>
            </ul>
        </Box>;
}
export default Faq;