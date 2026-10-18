import '~/locales/i18n';
import { RecoilRoot } from 'recoil';
import { getDefaultStore } from 'jotai';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import { ADMIN_PLATFORM_SCOPE, SystemCapabilities } from 'librechat-data-provider';
import type { FakeHandler } from '~/admin/test/backend';
import { createFakeBackend } from '~/admin/test/backend';
import { adminScopeAtom } from '~/admin/store';
import AdminApp from '../App';

let mockBackend = createFakeBackend({});
let mockAuthenticated = true;

jest.mock('~/admin/api/utils/api', () => ({
  ...jest.requireActual('~/admin/api/utils/api'),
  apiFetch: (path: string, init?: RequestInit) => mockBackend.fetch(path, init),
  platformFetch: (path: string, init?: RequestInit) => mockBackend.fetch(path, init),
}));

jest.mock('~/hooks/AuthContext', () => ({
  AuthContext: { Provider: ({ children }: { children: unknown }) => children },
  AuthContextProvider: ({ children }: { children: unknown }) => children,
  useAuthContext: () => ({ isAuthenticated: mockAuthenticated, logout: jest.fn() }),
}));

jest.mock('~/data-provider/Endpoints/queries', () => ({
  ...jest.requireActual('~/data-provider/Endpoints/queries'),
  useGetStartupConfig: () => ({ data: { appTitle: 'SassyChat' } }),
}));

const ALL = Object.values(SystemCapabilities);

function serve(routes: Record<string, FakeHandler>) {
  mockBackend = createFakeBackend({
    'GET /api/admin/session': () => ({
      body: { user: { id: 'op', name: 'Olive', email: 'olive@example.com' }, organizations: true },
    }),
    'GET /api/admin/grants/effective': () => ({ body: { capabilities: ALL } }),
    'GET /api/admin/organizations': () => ({ body: { organizations: [] } }),
    'GET /api/admin/organizations/org_acme': () => ({
      body: {
        organization: {
          id: 'org_acme',
          name: 'Acme',
          status: 'active',
          memberCount: 1,
          adminCount: 1,
          admins: [],
          pendingInviteCount: 0,
        },
      },
    }),
    ...routes,
  });
}

function renderPanel(path = '/admin') {
  return render(
    <RecoilRoot>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="/c/new" element={<p>{'chat'}</p>} />
        </Routes>
      </MemoryRouter>
    </RecoilRoot>,
  );
}

beforeEach(() => {
  mockAuthenticated = true;
  getDefaultStore().set(adminScopeAtom, ADMIN_PLATFORM_SCOPE);
});

describe('the built-in admin panel', () => {
  it('sends anyone the server does not let in back to the chat', async () => {
    serve({
      'GET /api/admin/session': () => ({ status: 403, body: { error_code: 'OPERATOR_REQUIRED' } }),
    });
    renderPanel();
    expect(await screen.findByText('chat')).toBeInTheDocument();
  });

  it('renders nothing until the session is signed in', () => {
    mockAuthenticated = false;
    serve({});
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
    expect(mockBackend.calls).toHaveLength(0);
  });

  it('shows the platform pages at the platform scope', async () => {
    serve({});
    renderPanel();
    const nav = await screen.findByRole('navigation', { name: '' });
    expect(await within(nav).findByRole('link', { name: 'Organizations' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Access' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Acting in: Platform' })).toBeInTheDocument();
  });

  it('shows the organization pages once an organization is the scope', async () => {
    getDefaultStore().set(adminScopeAtom, 'org_acme');
    serve({});
    renderPanel();
    const nav = await screen.findByRole('navigation', { name: '' });
    expect(await within(nav).findByRole('link', { name: 'Access' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Organizations' })).not.toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: 'Acting in: Acme' })).toBeInTheDocument();
  });

  it('offers a way back after the session check fails', async () => {
    serve({ 'GET /api/admin/session': () => ({ status: 500, body: {} }) });
    renderPanel();
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
