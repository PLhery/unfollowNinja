import React from 'react';
import {Box} from "grommet/es6";
import Styles from './Section.module.scss';

export default (props) => (
    <Box align='center' className={props.sloped ? Styles.sloped : ''} {...props}>
      <Box width='xlarge'>
        {props.children}
      </Box>
    </Box>
);
