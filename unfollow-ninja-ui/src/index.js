import React from 'react';
import { hydrate, render } from "react-dom";
import App from './App';
import * as Sentry from '@sentry/browser';
import * as serviceWorker from './serviceWorkerRegistration';

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
serviceWorker.unregister();
/*
serviceWorker.register({
  onUpdate: registration => {
    // reload the page if there is an update
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  }
});
*/
