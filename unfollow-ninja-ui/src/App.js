import React from 'react';

import './style.scss';

import {Box, Grommet, Heading, Image, Paragraph, Text} from 'grommet';
import GithubCorner from "react-github-corner";

import { Faq, Link, MiniApp, Navbar, Section, Repo }  from "./components";
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
  const isForeigner = !navigator.language?.startsWith?.('fr') && navigator.userAgent !== 'ReactSnap';
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
              {isForeigner ? <Paragraph margin={{top: 'xsmall'}}>
                English speaker? An international version is available at <Link href='https://unfollow-monkey.com/?utm_source=unfollowninja'>https://unfollow-monkey.com</Link>
              </Paragraph> : null}
			  <MiniApp/>
            </Box>
            <Box basis='medium' flex={true} pad='medium'>
              <Image width='100%' title='Exemple de notification' src={Images.DmScreenshot}/>
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
              <Paragraph>Merci à Hivane d'aider le projet à rester performant, libre, et gratuit, soutenant 100 000+ utilisateurs actifs.</Paragraph>
			  <Paragraph>UnfollowNinja s'appuie sur la librairie node <i>twitter-api-v2</i>, par le même auteur.</Paragraph>
              <Box gap='small' alignSelf='center' direction='row'>
				<Repo title='unfollowNinja' description='Get notified when your Twitter account loses a follower.' stars={140} forks={12}/>
				<Repo title='node-twitter-api-v2' description='Strongly typed, full-featured, light, versatile yet powerful Twitter API v1.1 and v2 client for Node.js.' stars={182} forks={12}/>
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
              © 2020 UnfollowNinja · <Link href='/cgu.pdf'>CGU</Link> ·
              Découvrez aussi <Link href='https://unfollow-monkey.com/?utm_source=unfollowninja_footer'><Image title='unfollowmonkey' src={Images.UnfollowMonkey} height={18}/></Link> UnfollowMonkey <Link href='https://uzzy.me/?utm_source=unfollowninja'><Image title='uzzy' src={Images.Uzzy} height={18}/></Link> Uzzy et <Link href='https://affinitweet.com/?utm_source=unfollowninja'><Image title='affinitweet' src={Images.Affinitweet} height={18}/></Link> Affinitweet ·
              Proposé par <Link href='https://twitter.com/plhery'>@plhery</Link> · Disponible sur <Link href='https://github.com/PLhery/unfollowNinja'>GitHub</Link>
            </Text>
          </Box>
        </Section>
        <GithubCorner href="https://github.com/PLhery/unfollowNinja" bannerColor="#70B7FD"/>
      </Grommet>
  );
}

export default App;
