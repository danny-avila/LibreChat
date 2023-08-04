import './matchMedia.mock';
import React from 'react';
import { render as rtlRender } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContextProvider } from '~/hooks/AuthContext';
import { BrowserRouter as Router } from 'react-router-dom';
import { RecoilRoot } from 'recoil';

const client = new QueryClient();

function renderWithProvidersWrapper(ui, { ...options } = {}) {
  function Wrapper({ children }) {
    return (
      <QueryClientProvider client={client}>
        <RecoilRoot>
          <Router>
            <AuthContextProvider
              authConfig={{
                loginRedirect: '',
              }}
            >
              {children}
            </AuthContextProvider>
          </Router>
        </RecoilRoot>
      </QueryClientProvider>
    );
  }
  return rtlRender(ui, { wrapper: Wrapper, ...options });
}
export * from '@testing-library/react';
export { renderWithProvidersWrapper as render };
