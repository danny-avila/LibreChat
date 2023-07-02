
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

//theme
import 'primereact/resources/themes/soho-light/theme.css';
//core
import 'primereact/resources/primereact.min.css';
//icons
import 'primeicons/primeicons.css';
//primeflex
import 'primeflex/primeflex.css';

const container = document.getElementById('root');
const root = createRoot(container as HTMLElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
