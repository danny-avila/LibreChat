import 'regenerator-runtime/runtime';
import React from 'react';
import ReactDOM from 'react-dom';
import singleSpaReact from 'single-spa-react';
import './locales/i18n';
import App from './App';
import './style.css';
import './mobile.css';
import { ApiErrorBoundaryProvider } from './hooks/ApiErrorBoundaryContext';
import 'katex/dist/katex.min.css';
import 'katex/dist/contrib/copy-tex.js';

const LibreChatApp = () => (
  <ApiErrorBoundaryProvider>
    <App />
  </ApiErrorBoundaryProvider>
);

const lifecycles = singleSpaReact({
  React,
  ReactDOM,
  rootComponent: LibreChatApp,
  errorBoundary(err, info, props) {
    console.error('LibreChat microfrontend error:', err, info);
    return React.createElement('div', {}, 'This renders when a catastrophic error occurs');
  },
});

// Export the lifecycle functions
export const bootstrap = lifecycles.bootstrap;
export const mount = lifecycles.mount;
export const unmount = lifecycles.unmount;

// For UMD builds, expose the lifecycle functions globally
if (typeof window !== 'undefined') {
  window.LibreChatMicrofrontend = {
    bootstrap: lifecycles.bootstrap,
    mount: lifecycles.mount,
    unmount: lifecycles.unmount
  };
}