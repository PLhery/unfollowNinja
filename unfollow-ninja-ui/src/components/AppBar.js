import React from 'react';
import {Box, Heading, Image} from "grommet/es6";
import * as Images from "../images";
import Styles from './AppBar.module.scss';

export default (props) => (
    <header className={Styles.appBar} {...props}>
      <a href='https://twitter.com/unfollowNinja' target='_blank' rel='noopener noreferrer'>
        <Box
            direction='row'
            align='center'
            width='xlarge'
            pad={{horizontal: 'medium', vertical: 'small'}}
        >
            <Image title='logo' height={40} margin={{horizontal: 'xsmall'}} src={Images.Logo}/>
            <Heading level={4} color='dark' margin={{vertical: 'small'}} style={{fontWeight: 500}}>UnfollowNinja</Heading>
        </Box>
      </a>
    </header>
);