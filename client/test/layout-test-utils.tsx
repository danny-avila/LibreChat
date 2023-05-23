import { render as rtlRender } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContextProvider } from '~/hooks/AuthContext';
import { BrowserRouter as Router } from 'react-router-dom';

const client = new QueryClient();

function renderWithProvidersWrapper(ui, { ...options } = {}) {
  function Wrapper({ children }) {
    return (
      <QueryClientProvider client={client}>
        <Router>
          <AuthContextProvider>{children}</AuthContextProvider>
        </Router>
      </QueryClientProvider>
    );
  }
  return rtlRender(ui, { wrapper: Wrapper, ...options });
}
export * from '@testing-library/react';
export { renderWithProvidersWrapper as render };
