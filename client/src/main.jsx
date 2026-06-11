import './polyfills/regeneratorRuntime';
import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './locales/i18n';
import App from './App';
import '@librechat/client/style.css';
import './style.css';
import './mobile.css';
import { ApiErrorBoundaryProvider } from './hooks/ApiErrorBoundaryContext';
import 'katex/dist/katex.min.css';
import 'katex/dist/contrib/copy-tex.js';

const CHCThemeProvider = import.meta.env.VITE_CHC_THEME === 'true'
  ? lazy(() =>
      import('~/theme/clickhouse').then((m) => ({ default: m.CHCThemeProvider }))
    )
  : null;

const container = document.getElementById('root');
const root = createRoot(container);

const tree = (
  <ApiErrorBoundaryProvider>
    <App />
  </ApiErrorBoundaryProvider>
);

root.render(
  CHCThemeProvider
    ? (
      <Suspense fallback={null}>
        <CHCThemeProvider>{tree}</CHCThemeProvider>
      </Suspense>
    )
    : tree,
);
