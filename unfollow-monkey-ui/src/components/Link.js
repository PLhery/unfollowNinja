import React from 'react';

const Link = (props) => (
    <a target='_blank' rel='noopener noreferrer' style={{color: 'inherit', fontWeight: 600}} {...props} >
      {props.children}
    </a>
);
export default Link;
