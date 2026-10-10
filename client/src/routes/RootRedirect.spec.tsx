/* eslint-disable i18next/no-literal-string */
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import RootRedirect from './RootRedirect';
import { SESSION_KEY } from '~/utils';

describe('root redirect', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    sessionStorage.clear();
  });

  it('restores the requested deep link after an OAuth callback returns to the app root', async () => {
    sessionStorage.setItem(SESSION_KEY, '/new?connection=credential&model=model');
    const router = createMemoryRouter(
      [
        { path: '/', element: <RootRedirect /> },
        { path: '/new', element: <div>Meo chat</div> },
        { path: '/c/new', element: <div>LibreChat chat</div> },
      ],
      { initialEntries: ['/'] },
    );

    render(<RouterProvider router={router} />);

    await waitFor(() => expect(router.state.location.pathname).toBe('/new'));
    expect(router.state.location.search).toBe('?connection=credential&model=model');
    expect(screen.getByText('Meo chat')).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('uses the regular new-chat route when there is no pending redirect', async () => {
    const router = createMemoryRouter(
      [
        { path: '/', element: <RootRedirect /> },
        { path: '/c/new', element: <div>LibreChat chat</div> },
      ],
      { initialEntries: ['/'] },
    );

    render(<RouterProvider router={router} />);

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/new'));
  });
});
