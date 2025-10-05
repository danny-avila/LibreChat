import 'regenerator-runtime/runtime';
import React from 'react';
import ReactDOM from 'react-dom';
import singleSpaReact from 'single-spa-react';
import './locales/i18n';
import App from './App';
import './style.css';
import './mobile.css';
import './utils/axios-setup.js'; // Configure axios for cross-origin credentials
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
  domElementGetter: () => {
    // Try to get the root element, create one if it doesn't exist
    let root = document.getElementById('root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'root';
      document.body.appendChild(root);
    }
    
    // Clear loading content
    const loadingContainer = document.getElementById('loading-container');
    if (loadingContainer) {
      loadingContainer.style.display = 'none';
    }
    
    return root;
  },
  errorBoundary(err, info, props) {
    console.error('LibreChat microfrontend error:', err, info);
    return React.createElement('div', { 
      style: { 
        padding: '20px', 
        textAlign: 'center', 
        fontFamily: 'sans-serif',
        color: 'red'
      } 
    }, `LibreChat encountered an error: ${err.message}. Please check the console for details.`);
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