import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ApiErrorBoundaryProvider } from '~/hooks/ApiErrorBoundaryContext';
import './style.css';
import './mobile.css';

// theme
import 'primereact/resources/themes/tailwind-light/theme.css';
// core
import 'primereact/resources/primereact.min.css';
//icons
import 'primeicons/primeicons.css';

const container = document.getElementById('root');
const root = createRoot(container as HTMLElement);

root.render(
  <React.StrictMode>
    <ApiErrorBoundaryProvider>
      <App />
    </ApiErrorBoundaryProvider>
  </React.StrictMode>
);
