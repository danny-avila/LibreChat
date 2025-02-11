import 'regenerator-runtime/runtime';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
import './mobile.css';
import { ApiErrorBoundaryProvider } from './hooks/ApiErrorBoundaryContext';
import { ThemeProvider } from '@mui/material';

// const theme = cerateTheme();

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <ApiErrorBoundaryProvider>
    {/* <ThemeProvider> */}
    <App />
    {/* </ThemeProvider> */}
  </ApiErrorBoundaryProvider>,
);
