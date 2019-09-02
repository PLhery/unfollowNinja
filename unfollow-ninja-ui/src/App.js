import React from 'react';
import './style.scss';
import 'react-github-cards/dist/default.css';

import {Box, Grommet, Heading, Image, Paragraph, Text} from 'grommet';
import { RepoCard } from 'react-github-cards';
import GithubCorner from "react-github-corner";
import { TwitterFollowButton } from 'react-twitter-embed'

import { Faq, Link, MiniApp, Navbar, Section }  from "./components";
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
    medium: {
      maxWidth: '800px',
    },
  },
};

function App() {
  return (
      <Grommet theme={theme}>
        <Section>
          <Navbar/>
        </Section>
        <Section>
          <Box direction='row' wrap={true} margin={{vertical: 'large'}}>
            <Box basis='medium' flex={true} pad='medium'>
              <Heading level={1} color='dark'>Soyez prévenus rapidement de vos unfollowers Twitter</Heading>
              <Paragraph size='large'>Unfollow Ninja vous envoie une notification dès qu'un twitto se désabonne de votre compte, en quelques secondes.</Paragraph>
              <MiniApp/>
            </Box>
            <Box basis='medium' flex={true} pad='medium'>
              <Image title='smartphone' src={Images.Smartphone}/>
            </Box>
          </Box>
        </Section>
        <Section background='lightPink' sloped={true}>
          <Box direction='row' wrap={true} align='center' justify='center'>
            <Box direction='row' basis='300px' flex='shrink' pad='medium' style={{maxWidth: '50vw'}}>
              <Image title='dog playing' fit='contain' src={Images.Dog}/>
            </Box>
            <Box basis='medium' flex={true} pad='medium' >
              <Heading level={2} color='dark'>UnfollowNinja est libre et gratuit</Heading>
              <Paragraph>UnfollowNinja est un projet <Link href='https://github.com/PLhery/unfollowNinja'>open-source</Link>, maintenu par <Link href='https://twitter.com/plhery'>@plhery</Link> et hébergé par <Link href='https://twitter.com/hivanenetwork'>HivaneNetwork</Link>.</Paragraph>
              <Paragraph>Merci à Hivane d'aider le projet à rester performant, libre, et gratuit, soutenant 35 000 utilisateurs.</Paragraph>
              <Box gap='small' alignSelf='center' style={{overflow: 'hidden'}}>
                <RepoCard username="plhery" repo="unfollowninja"/>
                <TwitterFollowButton screenName="unfollowninja" options={{size: 'large'}} />
              </Box>
            </Box>
          </Box>
        </Section>
        <Section background={`url(${Images.Alaska})`}>
          <Faq/>
        </Section>
        <Section>
          <Box direction='row' align='center' alignSelf='center' gap='small'>
            <Image title='logo' height={30} src={Images.Logo}/>
            <Text size='small' textAlign='center' style={{fontFamily: 'quicksand'}}>
              © 2019 UnfollowNinja · <Link href='https://uzzy.me/fr/cgu/'>CGU</Link> ·
              Découvrez aussi <Link href='https://uzzy.me'><Image title='uzzy' src='https://uzzy.me/img/logo.svg' height={18}/></Link> Uzzy et <Link href='https://uzzy.me'><Image title='affinitweet' src='https://static.affinitweet.com/images/affinitweet-page-loader.png' height={18}/></Link> Affinitweet ·
              Proposé par <Link href='https://twitter.com/plhery'>@plhery</Link> · Disponible sur <Link href='https://twitter.com/plhery'>GitHub</Link>
            </Text>
          </Box>
        </Section>
        <GithubCorner href="https://github.com/PLhery/unfollowNinja" bannerColor="#70B7FD"/>
      </Grommet>
  );
}

export default App;
