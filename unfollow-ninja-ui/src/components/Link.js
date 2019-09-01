import React from 'react';

export default (props) => (
    <a target='_blank' rel='noopener noreferrer' style={{color: 'inherit', fontWeight: 600}} {...props} >
      {props.children}
    </a>
);