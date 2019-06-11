import React from 'react';
import {Box, Button, Grommet, Heading, Image, Paragraph} from 'grommet';
import * as Icons from 'grommet-icons';
import * as Images from './images';



const theme = {
  global: {
    font: {
      family: 'Quicksand',
    },
    colors: {
      doc: '#4c4e6e',
      dark: '#1a1b46',
    }
  },
  heading: {
    weight: 500,
  }
};

const Container = (props) => (
    <Box
        direction='column'
        align='center'
        justify='between'
        {...props}
    />
);

const AppBar = (props) => (
    <Box
        as='header'
        direction='row'
        align='center'
        width='xlarge'
        pad={{horizontal: 'medium', vertical: 'small'}}
        style={{zIndex: '1'}}
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
          <Box direction='row' width='xlarge' gap='medium' wrap='true' align='center'>
            <Box basis='medium' flex='grow' pad='medium'>
              <Heading level={2} color='dark'>Soyez prévenus en quelques secondes de vos unfollowers Twitter</Heading>
              <Paragraph>Unfollow Ninja vous envoie un message privé dès qu'un twitto se désabonne de votre compte. Vous
                pouvez activer le service en 3 étapes simples :</Paragraph>
              <Box gap='small'>
                <Button
                    icon={<Icons.Twitter/>}
                    color='dark'
                    label='Connectez-vous à votre compte'
                    primary={true}
                />
                <Button
                    icon={<Icons.ChatOption/>}
                    color='dark'
                    label='Choisissez le compte qui vous enverra vos DMs'
                    disabled={true}
                />
                <Button
                    icon={<Icons.UserExpert/>}
                    color='dark'
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
      </Grommet>
  );
}

export default App;
