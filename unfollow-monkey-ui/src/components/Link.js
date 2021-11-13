import React from 'react';

function handleClick(e, props) {
    const { href, source } = props;
    if (window.gtag && href) {
        window.gtag('event', 'click', {
            'event_category': 'outbound',
            'event_label': href + (source ? '?source=' + source : ''),
        });
    }
}

const Link = (props) => (
    <a target='_blank' rel='noopener noreferrer' style={{color: 'inherit', fontWeight: 600}} onClick={(e) => handleClick(e, props)} {...props} >
      {props.children}
    </a>
);
export default Link;