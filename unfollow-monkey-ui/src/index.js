import React from 'react';
import { hydrate, render } from "react-dom";
import App from './App';
import * as Sentry from '@sentry/browser';
import * as serviceWorker from './serviceWorkerRegistration';
import reportWebVitals from './reportWebVitals';

const DSN = process.env.REACT_APP_SENTRY_DSN;
if (DSN) {
  Sentry.init({dsn: DSN});
}

const rootElement = document.getElementById("root");
if (rootElement.hasChildNodes()) {
  hydrate(<App />, rootElement);
} else {
  render(<App />, rootElement);
}

// ReactDOM.render(<App />, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.register({
  onUpdate: registration => {
    // reload the page if there is an update
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  }
});

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals(({ id, name, value }) => {
  if (window.gtag) {
    window.gtag('event', name, {
      'event_category': 'Web Vitals',
      'event_label': id,
      value: Math.round(name === 'CLS' ? value * 1000 : value),
      'non_interaction': true
    });
  }
});