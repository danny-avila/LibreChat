import { createRoot } from 'react-dom/client';
import 'katex/dist/contrib/copy-tex.js';
import 'regenerator-runtime/runtime';
import 'katex/dist/katex.min.css';
import { ApiErrorBoundaryProvider } from './hooks/ApiErrorBoundaryContext';
import './locales/i18n';
import App from './App';
import './mobile.css';
import './style.css';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <ApiErrorBoundaryProvider>
    <App />
  </ApiErrorBoundaryProvider>,
);
