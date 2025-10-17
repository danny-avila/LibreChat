import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import { RecoilRoot } from 'recoil';
import React from 'react';
import { AuthContextProvider } from '~/hooks/AuthContext';
import './matchMedia.mock';

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
                test: true,
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
