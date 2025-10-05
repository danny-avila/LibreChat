import React from 'react';
import ReactDOM from 'react-dom';
import singleSpaReact from 'single-spa-react';
import CustomHeader from './CustomHeader.jsx';

const CustomHeaderApp = () => (
  <CustomHeader />
);

const lifecycles = singleSpaReact({
  React,
  ReactDOM,
  rootComponent: CustomHeaderApp,
  domElementGetter: () => {
    // Get or create the custom header container
    let headerContainer = document.getElementById('custom-header');
    if (!headerContainer) {
      headerContainer = document.createElement('div');
      headerContainer.id = 'custom-header';
      headerContainer.style.position = 'fixed';
      headerContainer.style.top = '0';
      headerContainer.style.left = '0';
      headerContainer.style.right = '0';
      headerContainer.style.zIndex = '10000';
      headerContainer.style.width = '100%';
      
      // Append to body so it's always visible
      document.body.appendChild(headerContainer);
      
      // Add some top padding to body to account for fixed header
      document.body.style.paddingTop = '120px';
    }
    
    return headerContainer;
  },
  errorBoundary(err, info, props) {
    console.error('Custom header microfrontend error:', err, info);
    return React.createElement('div', { 
      style: { 
        padding: '20px', 
        textAlign: 'center', 
        fontFamily: 'sans-serif',
        color: 'red',
        backgroundColor: '#ffebee'
      } 
    }, `Custom header error: ${err.message}`);
  },
});

// Export the lifecycle functions
export const bootstrap = lifecycles.bootstrap;
export const mount = lifecycles.mount;
export const unmount = lifecycles.unmount;

// For UMD builds, expose the lifecycle functions globally
if (typeof window !== 'undefined') {
  window.CustomHeaderMicrofrontend = {
    bootstrap: lifecycles.bootstrap,
    mount: lifecycles.mount,
    unmount: lifecycles.unmount
  };
}