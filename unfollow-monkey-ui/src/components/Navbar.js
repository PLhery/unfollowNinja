import React from 'react';
import {Box, Heading, Image} from "grommet/es6";
import * as Images from "../images";
import Styles from './Navbar.module.scss';
import Link from "./Link";

const Navbar = (props) => (
    <header className={Styles.navbar} {...props}>
      <Link href='https://twitter.com/unfollowMonkey' source='navbar'>
        <Box
            direction='row'
            pad={{horizontal: 'medium', vertical: 'small'}}
        >
            <Image title='logo' height={40} margin={{horizontal: 'xsmall'}} src={Images.Logo}/>
            <Heading level={4} color='dark' margin={{vertical: 'small'}} style={{fontWeight: 500}}>UnfollowMonkey</Heading>
        </Box>
      </Link>
    </header>
);
export default Navbar;