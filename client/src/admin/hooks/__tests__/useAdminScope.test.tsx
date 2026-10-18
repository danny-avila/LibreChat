import { getDefaultStore } from 'jotai';
import { ADMIN_PLATFORM_SCOPE } from 'librechat-data-provider';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useBlocker } from 'react-router-dom';
import { useApplyScopeSwitch, useSwitchAdminScope } from '../useAdminScope';
import { QueryClient, QueryClientProvider } from '~/admin/query';
import { adminScopeAtom } from '~/admin/store';

function Switcher({ to }: { to: string }) {
  const switchScope = useSwitchAdminScope();
  useApplyScopeSwitch();
  return (
    <button type="button" onClick={() => switchScope(to)}>
      {'switch'}
    </button>
  );
}

/** Stands in for the configuration page's unsaved-edits guard. */
function DirtyPage() {
  const blocker = useBlocker(true);
  return blocker.state === 'blocked' ? (
    <button type="button" onClick={() => blocker.reset?.()}>
      {'stay'}
    </button>
  ) : null;
}

function setup(path: string, { dirty = false } = {}) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(['adminSession'], { user: { id: 'operator' }, organizations: true });
  queryClient.setQueryData(['users'], [{ id: 'someone' }]);
  const router = createMemoryRouter(
    [
      {
        path: '/admin/*',
        element: (
          <>
            <Switcher to="org_acme" />
            {dirty && <DirtyPage />}
          </>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

beforeEach(() => {
  getDefaultStore().set(adminScopeAtom, ADMIN_PLATFORM_SCOPE);
});

describe('admin scope switching', () => {
  it('moves to the dashboard, applies the scope and forgets the data of the old scope', async () => {
    const { router, queryClient } = setup('/admin/users');

    fireEvent.click(screen.getByRole('button', { name: 'switch' }));

    await waitFor(() => expect(getDefaultStore().get(adminScopeAtom)).toBe('org_acme'));
    expect(router.state.location.pathname).toBe('/admin');
    expect(queryClient.getQueryData(['users'])).toBeUndefined();
    expect(queryClient.getQueryData(['adminSession'])).toBeDefined();
    /* The request is cleared from history, so Back never replays it. */
    await waitFor(() => expect(router.state.location.state).toBeNull());
  });

  it('keeps the scope when the unsaved-edits guard holds the switch', async () => {
    const { router, queryClient } = setup('/admin/configuration', { dirty: true });

    fireEvent.click(screen.getByRole('button', { name: 'switch' }));
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'stay' }));
    });

    expect(router.state.location.pathname).toBe('/admin/configuration');
    expect(getDefaultStore().get(adminScopeAtom)).toBe(ADMIN_PLATFORM_SCOPE);
    expect(queryClient.getQueryData(['users'])).toEqual([{ id: 'someone' }]);
  });
});
