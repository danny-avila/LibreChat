import '~/locales/i18n';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { TAdminAccount, TAdminAccountDetail } from 'librechat-data-provider';
import type { FakeHandler } from '~/admin/test/backend';
import { createFakeBackend } from '~/admin/test/backend';
import { renderAdmin } from '~/admin/test/render';
import { AccountsPage } from '../AccountsPage';

let mockBackend = createFakeBackend({});

jest.mock('~/admin/api/utils/api', () => ({
  ...jest.requireActual('~/admin/api/utils/api'),
  apiFetch: (path: string, init?: RequestInit) => mockBackend.fetch(path, init),
  platformFetch: (path: string, init?: RequestInit) => mockBackend.fetch(path, init),
}));

const ana: TAdminAccount = {
  id: 'a'.repeat(24),
  name: 'Ana',
  email: 'ana@acme.test',
  isPlatformOperator: true,
  emailVerified: true,
};
const bo: TAdminAccount = { id: 'b'.repeat(24), email: 'bo@beta.test', emailVerified: false };
const anaDetail: TAdminAccountDetail = {
  ...ana,
  memberships: [
    {
      organization: { id: 'org_acme', name: 'Acme', status: 'active' },
      role: 'ADMIN',
      status: 'active',
    },
    {
      organization: { id: 'org_beta', name: 'Beta', status: 'suspended' },
      role: 'USER',
      status: 'deactivated',
    },
  ],
};

function serve(routes: Record<string, FakeHandler> = {}) {
  mockBackend = createFakeBackend({
    'GET /api/admin/accounts': ({ url }) =>
      url.searchParams.get('search') === 'bo'
        ? { body: { accounts: [bo] } }
        : { body: { accounts: [ana, bo] } },
    [`GET /api/admin/accounts/${ana.id}`]: () => ({ body: { account: anaDetail } }),
    ...routes,
  });
}

describe('AccountsPage', () => {
  it('lists login accounts, marking the operator and unverified emails', async () => {
    serve();
    renderAdmin(<AccountsPage />, { path: '/admin/users' });

    const list = await screen.findByRole('list', { name: 'Accounts' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Platform operator');
    expect(items[1]).toHaveTextContent('Email not verified');
  });

  it('searches on the server', async () => {
    serve();
    renderAdmin(<AccountsPage />);
    await screen.findByText('Ana');

    fireEvent.change(screen.getByPlaceholderText('Search accounts by name or email'), {
      target: { value: 'bo' },
    });

    await waitFor(() => expect(screen.queryByText('Ana')).not.toBeInTheDocument());
    expect(screen.getAllByText('bo@beta.test').length).toBeGreaterThan(0);
  });

  it('shows the organizations an account belongs to', async () => {
    serve();
    renderAdmin(<AccountsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Ana/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Account' });
    expect(await within(dialog).findByText('Acme')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('ADMIN · Active');
    expect(dialog).toHaveTextContent('USER · Deactivated');
    expect(within(dialog).getByText('Suspended')).toBeInTheDocument();
  });

  it('says so when no account matches', async () => {
    serve({ 'GET /api/admin/accounts': () => ({ body: { accounts: [] } }) });
    renderAdmin(<AccountsPage />);
    expect(await screen.findByText('No accounts match your search.')).toBeInTheDocument();
  });

  it('shows a localized failure', async () => {
    serve({ 'GET /api/admin/accounts': () => ({ status: 500, body: { error: 'boom' } }) });
    renderAdmin(<AccountsPage />);
    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });
});
