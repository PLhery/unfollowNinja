import React from 'react';
import {Box, Heading, Paragraph} from "grommet/es6";
import Emojify from 'react-emojione';

export default (props) => (
    <Box alignSelf='center' pad='medium' margin='medium' background='rgba(255, 255, 255, 0.5)' {...props}>
      <Heading level={1} color='dark'>Foire aux questions</Heading>
      <Heading level={3} color='dark'>Que signifient les différents messages et emojis ?</Heading>
      <Paragraph><Emojify style={{height: 20, width: 20}}><ul>
        <li>Les messages suivants parlent d'eux-meme :<ul>
          <li><b>@username</b> vous a unfollow :wave:</li>
          <li><b>@username</b> a été suspendu :see_no_evil:</li>
          <li><b>@username</b> vous a bloqué :no_entry:</li>
          <li>Vous avez bloqué <b>@username</b> :poop:</li>
        </ul></li>
        <li><b>@username</b> a quitté Twitter :see_no_evil: peut signifier que la personne a été suspendue quelques minutes, a fermé son compte, ou a été retiré de Twitter par exemple à cause de la limite d'age.</li>
        <li>L'emoji est un coeur brisé :broken_heart: si cette personne est un mutual, que vous la suiviez.</li>
        <li>Si plus de 20 twittos vous unfollowent en moins de deux minutes, vous ne serez informé que des 20 premiers, ainsi que du nombre total de followers perdus.</li>
        <li>"Un twitto a quitté Twitter :see_no_evil:" : quand le nom d'utilisateur de la personne qui a fermé son compte n'a pas eu le temps d'etre sauvegardé (peut prendre 48h), vous ne recevez pas son pseudo, mais êtes informé de cet abonné en moins.</li>
        <li>"Ce compte vous suivait avant votre inscription à <b>@unfollowninja</b> !" : nous n'arrivons pas toujours à retrouver la date de follow exacte de chaque unfollower. Si on ne la trouve pas, nous vous donnons la première fois que nous l'avons vu sur votre compte. Mais s'il était déjà sur votre compte lors de votre inscription, nous ne pouvons vous donner de date.</li>


      </ul></Emojify></Paragraph>

      <Heading level={3} color='dark'>Un ami m'a unfollow mais je n'ai pas été prévenu</Heading>
      <Paragraph>Pas grand chose</Paragraph>

      <Heading level={3} color='dark'>Je ne recois pas de notification à la deuxième étape</Heading>
      <Paragraph>Pas grand chose</Paragraph>


      <Heading level={3} color='dark'>Pourquoi, à la deuxième étape, dois-je donner l'accès aux messages privés et aux tweets ?</Heading>
      <Paragraph>Pas grand chose</Paragraph>
      <Heading level={3} color='dark'>Publierez-vous des tweets sans mon accord ?</Heading>
      <Paragraph>Jamais</Paragraph>

      <Heading level={3} color='dark'>Pourquoi dois-je me connecter deux fois ?</Heading>
      <Paragraph>Pas grand chose</Paragraph>
    </Box>
);