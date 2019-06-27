import React from 'react';

import {Box, Button, Grommet, Heading, Image, Paragraph} from 'grommet';
import * as Icons from 'grommet-icons';
import GithubCorner from "react-github-corner";

import { AppBar, Link }  from "./components";
import * as Images from './images';

const theme = {
  global: {
    font: {
      family: 'Open Sans',
    },
    colors: {
      doc: '#4c4e6e',
      dark: '#1a1b46',
      lightPink: '#ffeeed',
      brand: '#70B7FD',
    },
  },
  heading: {
    font: {
      family: 'Quicksand',
    },
    weight: 700,
  },
  paragraph: {
    large: {
      height: '32px',
    },
  },
};

const Container = (props) => (
    <Box
        direction='column'
        align='center'
        justify='between'
        {...props}
    />
);

function App() {
  return (
      <Grommet theme={theme}>
        <Container>
          <AppBar>
            <Image title='logo' height={40} margin={{horizontal: 'xsmall'}}
                   src={Images.Logo}/>
            <Heading level={4} color='dark' margin={{vertical: 'small'}}>UnfollowNinja</Heading>
          </AppBar>
          <Box direction='row' width='xlarge' gap='medium' wrap='true' align='center' margin={{vertical: 'large'}}>
            <Box basis='medium' flex='grow' pad='medium'>
              <Heading level={1} color='dark'>Soyez prévenus rapidement de vos unfollowers Twitter</Heading>
              <Paragraph size='large'>Unfollow Ninja vous envoie un message privé dès qu'un twitto se désabonne de votre compte, en quelques secondes.</Paragraph>
              <Box gap='small' margin={{horizontal: 'small', vertical: 'medium'}}>
                <Button
                    icon={<Icons.Twitter color='white'/>}
                    label='Connectez-vous à votre compte'
                    primary={true}
                    style={{color: 'white'}}
                />
                <Button
                    icon={<Icons.ChatOption/>}
                    label='Choisissez le compte qui vous enverra vos DMs'
                    disabled={true}
                />
                <Button
                    icon={<Icons.UserExpert/>}
                    label='Suivez @UnfollowNinja'
                    disabled={true}
                />
              </Box>
            </Box>
            <Box basis='medium' flex='grow' pad='medium'>
              <Image title='smartphone' src={Images.Smartphone}/>
            </Box>
          </Box>
        </Container>
        <Container background='lightPink' className='angled'>
          <Box direction='row' width='xlarge' gap='medium' wrap='true' align='center'>
            <Box basis='small' flex='grow' pad='medium'>
              <Image title='dog playing' fit='contain' src={Images.Dog}/>
            </Box>
            <Box basis='medium' flex='grow' pad='medium' >
              <Heading level={2} color='dark'>UnfollowNinja est libre et gratuit</Heading>
              <Paragraph>UnfollowNinja est un projet <Link href='https://github.com/PLhery/unfollowNinja'>open-source</Link>, maintenu par <Link href='https://twitter.com/plhery'>@plhery</Link> et hébergé par <Link href='https://twitter.com/hivanenetwork'>HivaneNetwork</Link>.</Paragraph>
              <Paragraph>Merci à Hivane d'aider le projet à rester performant, libre, et gratuit, soutenant 35 000 utilisateurs.</Paragraph>
            </Box>
          </Box>
        </Container>
        <GithubCorner href="https://github.com/PLhery/unfollowNinja" bannerColor="#70B7FD"/>
      </Grommet>
  );
}

export default App;
