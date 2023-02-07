import React from 'react';
// import reactDom from 'react-dom'; ---> deprecated
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './src/store';
import App from './src/App';
import './src/style.css';

const container = document.getElementById('root');
const root = createRoot(container); // createRoot(container!) if you use TypeScript
// reactDom.render(<App />, document.getElementById('root'));
root.render(
  <Provider store={store}>
    <App />
  </Provider>
);
