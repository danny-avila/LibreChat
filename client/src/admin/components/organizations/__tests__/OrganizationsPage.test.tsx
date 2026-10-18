import '~/locales/i18n';
import { AdminErrorCode } from 'librechat-data-provider';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { TAdminOrganization, TAdminOrganizationDetail } from 'librechat-data-provider';
import type { FakeHandler } from '~/admin/test/backend';
import { createFakeBackend } from '~/admin/test/backend';
import { OrganizationsPage } from '../OrganizationsPage';
import { renderAdmin } from '~/admin/test/render';

let mockBackend = createFakeBackend({});

jest.mock('~/admin/api/utils/api', () => ({
  ...jest.requireActual('~/admin/api/utils/api'),
  apiFetch: (path: string, init?: RequestInit) => mockBackend.fetch(path, init),
  platformFetch: (path: string, init?: RequestInit) => mockBackend.fetch(path, init),
}));

const acme: TAdminOrganization = {
  id: 'org_acme',
  name: 'Acme',
  status: 'active',
  createdAt: '2026-03-01T00:00:00.000Z',
  createdBy: { id: 'u1', email: 'ana@acme.test' },
  memberCount: 12,
  adminCount: 2,
};
const sleepy: TAdminOrganization = {
  id: 'org_sleepy',
  name: 'Sleepy',
  status: 'suspended',
  memberCount: 3,
  adminCount: 1,
};
const acmeDetail: TAdminOrganizationDetail = {
  ...acme,
  admins: [{ id: 'u1', name: 'Ana', email: 'ana@acme.test' }],
  pendingInviteCount: 4,
};

function serve(routes: Record<string, FakeHandler>) {
  mockBackend = createFakeBackend({
    'GET /api/admin/organizations': () => ({ body: { organizations: [acme, sleepy] } }),
    'GET /api/admin/organizations/org_acme': () => ({ body: { organization: acmeDetail } }),
    ...routes,
  });
}

describe('OrganizationsPage', () => {
  it('lists every organization with its status and counts', async () => {
    serve({});
    renderAdmin(<OrganizationsPage />, { path: '/admin/organizations' });

    const table = await screen.findByRole('table', { name: 'Organizations' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('Acme');
    expect(rows[1]).toHaveTextContent('Created by ana@acme.test');
    expect(rows[1]).toHaveTextContent('Active');
    expect(rows[1]).toHaveTextContent('12');
    expect(rows[2]).toHaveTextContent('Suspended');
  });

  it('says so when nothing matches', async () => {
    serve({ 'GET /api/admin/organizations': () => ({ body: { organizations: [] } }) });
    renderAdmin(<OrganizationsPage />);
    expect(await screen.findByText('No organizations match.')).toBeInTheDocument();
  });

  it('shows a localized failure, never the server text, and retries', async () => {
    let failing = true;
    serve({
      'GET /api/admin/organizations': () =>
        failing
          ? { status: 403, body: { error: 'raw upstream detail', error_code: 'OPERATOR_REQUIRED' } }
          : { body: { organizations: [acme] } },
    });
    renderAdmin(<OrganizationsPage />);

    expect(await screen.findByText('Only the platform operator can do this.')).toBeInTheDocument();
    expect(screen.queryByText('raw upstream detail')).not.toBeInTheDocument();
    failing = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Acme')).toBeInTheDocument();
  });

  it('pages forward with the cursor the server returned', async () => {
    serve({
      'GET /api/admin/organizations': ({ url }) =>
        url.searchParams.get('after') === 'next-1'
          ? { body: { organizations: [sleepy] } }
          : { body: { organizations: [acme], nextCursor: 'next-1' } },
    });
    renderAdmin(<OrganizationsPage />);

    await screen.findByText('Acme');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Sleepy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
  });

  it('deletes only once the organization name is typed exactly', async () => {
    serve({
      'DELETE /api/admin/organizations/org_acme': ({ init }) =>
        JSON.parse(String(init?.body)).confirmName === 'Acme'
          ? { status: 202, body: { id: 'org_acme', status: 'deleting' } }
          : { status: 400, body: { error_code: AdminErrorCode.CONFIRMATION_MISMATCH } },
    });
    renderAdmin(<OrganizationsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open Acme' }));
    const dialog = await screen.findByRole('dialog', { name: 'Acme' });
    expect(dialog).toHaveTextContent('Ana');
    expect(dialog).toHaveTextContent('12 members · 4 pending invitations');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete organization' }));

    const confirm = await screen.findByRole('dialog', { name: 'Delete Acme?' });
    const submit = within(confirm).getByRole('button', { name: 'Delete organization' });
    const field = within(confirm).getByLabelText('Type Acme to confirm');
    fireEvent.change(field, { target: { value: 'acme' } });
    expect(submit).toBeDisabled();
    fireEvent.change(field, { target: { value: 'Acme' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(
        mockBackend.calls.some(
          (call) => call.method === 'DELETE' && call.path === '/api/admin/organizations/org_acme',
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Delete Acme?' })).not.toBeInTheDocument(),
    );
  });

  it('suspends after confirming, then shows the organization as suspended', async () => {
    let status = 'active';
    serve({
      'GET /api/admin/organizations/org_acme': () => ({
        body: { organization: { ...acmeDetail, status } },
      }),
      'POST /api/admin/organizations/org_acme/suspend': () => {
        status = 'suspended';
        return { body: { organization: { ...acme, status } } };
      },
    });
    renderAdmin(<OrganizationsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open Acme' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Suspend' }));
    const confirm = await screen.findByRole('dialog', { name: 'Suspend Acme?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Suspend' }));

    const dialog = await screen.findByRole('dialog', { name: 'Acme' });
    expect(await within(dialog).findByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
  });

  it('switches the panel to the organization from "Manage in the panel"', async () => {
    serve({});
    renderAdmin(<OrganizationsPage />, { path: '/admin/organizations' });

    fireEvent.click(await screen.findByRole('button', { name: 'Open Acme' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Manage in the panel' }));

    const location = screen.getByTestId('location');
    await waitFor(() => expect(location).toHaveTextContent('/admin'));
    expect(JSON.parse(location.dataset.state ?? 'null')).toEqual({ adminScope: 'org_acme' });
  });
});
