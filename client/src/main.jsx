import 'regenerator-runtime/runtime';
import { createRoot } from 'react-dom/client';
import './locales/i18n';
import App from './App';
import './style.css';
import './mobile.css';
import './forked-style-custom/custom-daniel-ai.css';
import { ApiErrorBoundaryProvider } from './hooks/ApiErrorBoundaryContext';
import forkedFeatures from './forked-code-custom';

// Initialize forked custom features
forkedFeatures.initialize();

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <ApiErrorBoundaryProvider>
    <App />
  </ApiErrorBoundaryProvider>,
);
