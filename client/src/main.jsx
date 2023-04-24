import { createRoot } from 'react-dom/client';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from './hooks/ThemeContext';
import App from './App';
import './style.css';
import './mobile.css';

const container = document.getElementById('root');
const root = createRoot(container);

const queryClient = new QueryClient();

root.render(
  <QueryClientProvider client={queryClient}>
    <RecoilRoot>
      <ThemeProvider>
          <App />
      </ThemeProvider>
    </RecoilRoot>
  </QueryClientProvider>
);
