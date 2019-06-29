import React from 'react';
import {Box, Heading, Paragraph} from "grommet/es6";
import Emojify from 'react-emojione';

export default (props) => (
    <Box basis='large' alignSelf='center' pad='medium' margin='medium' background='rgba(255, 255, 255, 0.5)' {...props}>
      <Heading level={1} color='dark'>Foire aux questions</Heading>
      <Heading level={3} color='dark'>Que signifient les différents messages et emojis ?</Heading>
          <Paragraph><Emojify style={{height: 20, width: 20}}>- <b>@username</b> vous a unfollow :wave: signifie</Emojify></Paragraph>
      <Heading level={3} color='dark'>Pourquoi, à la deuxième étape, dois-je donner l'accès aux messages privés et aux tweets ?</Heading>
      <Paragraph>Pas grand chose</Paragraph>
      <Heading level={3} color='dark'>Publierez-vous des tweets sans mon accord ?</Heading>
      <Paragraph>Pas grand chose</Paragraph>
      <Heading level={3} color='dark'>Pourquoi dois-je me connecter deux fois ?</Heading>
      <Paragraph>Pas grand chose</Paragraph>
    </Box>
);