import React, { useContext } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { useApiErrorBoundary } from '~/hooks/ApiErrorBoundaryContext';
import { router } from './routes';
import { PrimeReactProvider } from 'primereact/api';
import { ThemeProvider } from '~/hooks/ThemeContext';

const App = () => {
  // const { setInputStyle } = useContext(PrimeReactContext);

  // setInputStyle('filled');

  const { setError } = useApiErrorBoundary();

  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        //@ts-ignore - error type is unknown
        if (error?.response?.status === 401) {
          setError(error);
        }
      }
    })
  });

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider initialTheme={'light'}>
        <PrimeReactProvider>
          <RouterProvider router={router} />
          <ReactQueryDevtools initialIsOpen={false} position="top-right" />
        </PrimeReactProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
