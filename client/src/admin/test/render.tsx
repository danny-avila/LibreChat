import { getDefaultStore } from 'jotai';
import { render } from '@testing-library/react';
import { ADMIN_PLATFORM_SCOPE } from 'librechat-data-provider';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import type { AdminRouteContextValue } from '~/admin/router';
import { QueryClient, QueryClientProvider } from '~/admin/query';
import { AdminRouteContext } from '~/admin/router';
import { adminScopeAtom } from '~/admin/store';

/** Where the router is, for assertions on navigation. */
function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname}
    </output>
  );
}

export interface RenderAdminOptions {
  /** The browser path to start at (under `/admin`). */
  path?: string;
  scope?: string;
  context?: Partial<AdminRouteContextValue>;
}

/** Renders part of the panel inside the router, query cache and context the layout gives it. */
export function renderAdmin(
  ui: ReactElement,
  { path = '/admin', scope = ADMIN_PLATFORM_SCOPE, context }: RenderAdminOptions = {},
) {
  getDefaultStore().set(adminScopeAtom, scope);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const value: AdminRouteContextValue = {
    user: { id: 'operator', name: 'Olive Operator', email: 'olive@example.com' },
    organizations: true,
    ...context,
  };
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <AdminRouteContext.Provider value={value}>
          <Routes>
            <Route path="*" element={ui} />
          </Routes>
          <LocationProbe />
        </AdminRouteContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...result, queryClient };
}
