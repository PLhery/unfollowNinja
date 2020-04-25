import React from 'react';
import { BrowserRouter as Router } from "react-router-dom";
import { ApolloClient, ApolloProvider, InMemoryCache } from '@apollo/client';
import { nanoid } from 'nanoid';
import Cookies from 'js-cookie'

import './style.scss';
import 'react-github-cards/dist/default.css';

import {Box, Grommet, Heading, Image, Paragraph, Text} from 'grommet';
import { RepoCard } from 'react-github-cards';
import GithubCorner from "react-github-corner";

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

if (!Cookies.get('uid')) {
  if (sessionStorage['uid']) { // for the transition sessionStorage->cookie TODO remove
    Cookies.set('uid', sessionStorage['uid'], { secure: window.location.protocol === 'https:' });
  } else {
    Cookies.set('uid', nanoid(), { secure: true });
  }
}

const client = new ApolloClient({
  cache: new InMemoryCache(),
  uri: 'https://api.unfollow.ninja',
  headers: {
    uid: Cookies.get('uid'),
  }
});

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
              <ApolloProvider client={client}>
                <Router>
                  <MiniApp/>
                </Router>
              </ApolloProvider>
            </Box>
            <Box basis='medium' flex={true} pad='medium'>
              <object title='smartphone' data={Images.Smartphone}/>
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
              <Paragraph>Merci à Hivane d'aider le projet à rester performant, libre, et gratuit, soutenant 60 000+ utilisateurs actifs.</Paragraph>
              <Box gap='small' alignSelf='center' style={{overflow: 'hidden'}}>
                <RepoCard username="plhery" repo="unfollowninja"/>
                <a href="https://twitter.com/unfollowNinja?ref_src=twsrc%5Etfw" className="twitter-follow-button"
                   data-size="large" data-dnt="true">Follow @unfollowNinja</a>
              </Box>
            </Box>
          </Box>
        </Section>
        <Section background={`url(${Images.useAlaska()})`}>
          <Faq/>
        </Section>
        <Section>
          <Box direction='row' align='center' alignSelf='center' gap='small'>
            <Image title='logo' height={30} src={Images.Logo}/>
            <Text size='small' textAlign='center' style={{fontFamily: 'quicksand'}}>
              © 2020 UnfollowNinja · <Link href='https://uzzy.me/fr/cgu/?utm_source=unfollowninja'>CGU</Link> ·
              Découvrez aussi <Link href='https://uzzy.me/?utm_source=unfollowninja'><Image title='uzzy' src={Images.Uzzy} height={18}/></Link> Uzzy et <Link href='https://affinitweet.com/?utm_source=unfollowninja'><Image title='affinitweet' src={Images.Affinitweet} height={18}/></Link> Affinitweet ·
              Proposé par <Link href='https://twitter.com/plhery'>@plhery</Link> · Disponible sur <Link href='https://twitter.com/plhery'>GitHub</Link>
            </Text>
          </Box>
        </Section>
        <GithubCorner href="https://github.com/PLhery/unfollowNinja" bannerColor="#70B7FD"/>
      </Grommet>
  );
}

export default App;
