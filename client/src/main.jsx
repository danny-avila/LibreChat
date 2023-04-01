import React from 'react';
import { createRoot } from 'react-dom/client';
// import { Provider } from 'react-redux';
// import { store } from './src/store';
import { RecoilRoot } from 'recoil';

import { ThemeProvider } from './hooks/ThemeContext';
import App from './App';
import './style.css';
import './mobile.css';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <RecoilRoot>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </RecoilRoot>
);
