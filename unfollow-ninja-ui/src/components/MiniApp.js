import React from 'react';
import {
    Box, Paragraph,
} from 'grommet';
import {Alert} from "grommet-icons";

import './MiniApp.module.scss';
import Link from "./Link";

function MiniApp(props) {
  return (
      <Box gap='small' margin={{horizontal: 'small', vertical: 'medium'}} {...props}>
		  <Paragraph textAlign='center'><Alert/><br/>
              [Avril 2023] Elon Musk a décidé de désactiver les applications Twitter gratuites, y compris <Link href="https://twitter.com/unfollowninja">@UnfollowNinja</Link>.<br/><br/>
              Il n'est donc plus possible de se connecter.<br/>
              Merci pour votre soutien depuis 2013, c'était fun ♥️<br/>
              [Juin 2023] La version anglaise que je maintiens, <Link href='https://unfollow-monkey.com'>Unfollow Monkey</Link>, est de nouveau disponible!
          </Paragraph>
      </Box>
  );
}

export default MiniApp;
