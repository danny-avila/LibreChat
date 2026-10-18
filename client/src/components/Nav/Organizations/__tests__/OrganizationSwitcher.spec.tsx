import userEvent from '@testing-library/user-event';
import type { TUser, TStartupConfig, TOrganizationMembership } from 'librechat-data-provider';
import * as organizationMutations from '~/data-provider/Organizations/mutations';
import * as organizationQueries from '~/data-provider/Organizations/queries';
import * as endpointQueries from '~/data-provider/Endpoints/queries';
import { render, screen, waitFor } from 'test/layout-test-utils';
import * as adminQueries from '~/data-provider/Admin/queries';
import OrganizationSwitcher from '../OrganizationSwitcher';
import * as authContext from '~/hooks/AuthContext';

const memberships: TOrganizationMembership[] = [
  { organization: { id: 'org_a', name: 'Acme' }, role: 'ADMIN', status: 'active', current: true },
  { organization: { id: 'org_b', name: 'Beta' }, role: 'USER', status: 'active', current: false },
];

const switchMutate = jest.fn();
const acceptMutate = jest.fn();

function setup({
  enabled = true,
  allowCreate = true,
  operator = false,
  organizations = memberships,
  pending = [] as Array<{ id: string; organization: { id: string; name: string } }>,
} = {}) {
  if (operator) {
    const actual = authContext.useAuthContext;
    jest.spyOn(authContext, 'useAuthContext').mockImplementation(() => ({
      ...actual(),
      user: { id: 'operator', isPlatformOperator: true } as TUser,
    }));
    jest
      .spyOn(adminQueries, 'useAdminOrganizationsQuery')
      //@ts-ignore - only the fields the dialog reads
      .mockReturnValue({
        data: {
          organizations: [
            { id: 'org_a', name: 'Acme', status: 'active', memberCount: 3, adminCount: 1 },
            { id: 'org_x', name: 'Xylo', status: 'suspended', memberCount: 8, adminCount: 2 },
          ],
        },
        isLoading: false,
        isError: false,
        isFetching: false,
      });
  }
  jest
    .spyOn(endpointQueries, 'useGetStartupConfig')
    //@ts-ignore - only the fields the switcher reads
    .mockReturnValue({
      data: (enabled
        ? {
            organizations: {
              enabled: true,
              allowCreate,
              allowLinkInvites: true,
              maxPerAccount: 10,
            },
          }
        : {}) as TStartupConfig,
    });
  jest
    .spyOn(organizationQueries, 'useOrganizationsQuery')
    //@ts-ignore - only the fields the switcher reads
    .mockReturnValue({ data: { organizations } });
  jest
    .spyOn(organizationQueries, 'usePendingOrganizationInvitesQuery')
    //@ts-ignore - only the fields the switcher reads
    .mockReturnValue({ data: { invites: pending } });
  jest
    .spyOn(organizationMutations, 'useSwitchOrganizationMutation')
    //@ts-ignore - only the fields the switcher reads
    .mockReturnValue({ mutate: switchMutate, isLoading: false });
  jest
    .spyOn(organizationMutations, 'useAcceptPendingOrganizationInviteMutation')
    //@ts-ignore - only the fields the switcher reads
    .mockReturnValue({ mutate: acceptMutate, isLoading: false });
  return render(<OrganizationSwitcher />);
}

beforeEach(() => {
  jest.restoreAllMocks();
  switchMutate.mockClear();
  acceptMutate.mockClear();
});

test('shows the current organization on its trigger', () => {
  setup();

  const trigger = screen.getByTestId('organization-switcher');
  expect(trigger).toHaveAccessibleName(/Current organization: Acme/);
  expect(trigger).toHaveTextContent('A');
});

test('lists every organization, marks the current one, and switches to another', async () => {
  setup();

  await userEvent.click(screen.getByTestId('organization-switcher'));
  const acme = await screen.findByRole('menuitemradio', { name: 'Acme' });
  const beta = screen.getByRole('menuitemradio', { name: 'Beta' });
  expect(acme).toHaveAttribute('aria-checked', 'true');
  expect(beta).toHaveAttribute('aria-checked', 'false');

  await userEvent.click(acme);
  expect(switchMutate).not.toHaveBeenCalled();

  await userEvent.click(screen.getByTestId('organization-switcher'));
  await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Beta' }));
  expect(switchMutate).toHaveBeenCalledWith('org_b');
});

test('offers pending invitations and organization creation', async () => {
  setup({ pending: [{ id: 'invite-1', organization: { id: 'org_c', name: 'Gamma' } }] });

  await userEvent.click(screen.getByTestId('organization-switcher'));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Join Gamma' }));

  expect(acceptMutate).toHaveBeenCalledWith('invite-1');
  await userEvent.click(screen.getByTestId('organization-switcher'));
  expect(await screen.findByTestId('create-organization-menu-item')).toBeInTheDocument();
});

test('opens the create dialog from the menu', async () => {
  setup();

  await userEvent.click(screen.getByTestId('organization-switcher'));
  await userEvent.click(await screen.findByTestId('create-organization-menu-item'));

  await waitFor(() =>
    expect(screen.getByRole('dialog', { name: /Create an organization/i })).toBeInTheDocument(),
  );
});

test('hides creation when the deployment turns it off', async () => {
  setup({ allowCreate: false });

  await userEvent.click(screen.getByTestId('organization-switcher'));
  await screen.findByRole('menuitemradio', { name: 'Beta' });

  expect(screen.queryByTestId('create-organization-menu-item')).not.toBeInTheDocument();
});

test('renders nothing without organizations', () => {
  setup({ enabled: false });

  expect(screen.queryByTestId('organization-switcher')).not.toBeInTheDocument();
});

test('shows a suspended organization disabled to its members', async () => {
  setup({
    organizations: [
      memberships[0],
      {
        organization: { id: 'org_s', name: 'Sleepy', status: 'suspended' },
        role: 'USER',
        status: 'active',
        current: false,
      },
    ],
  });

  await userEvent.click(screen.getByTestId('organization-switcher'));
  const sleepy = await screen.findByRole('menuitemradio', { name: 'Sleepy (suspended)' });

  expect(sleepy).toHaveAttribute('aria-disabled', 'true');
  expect(screen.queryByTestId('all-organizations-menu-item')).not.toBeInTheDocument();
});

test('lets the platform operator enter any organization, suspended ones included', async () => {
  setup({ operator: true });

  await userEvent.click(screen.getByTestId('organization-switcher'));
  await userEvent.click(await screen.findByTestId('all-organizations-menu-item'));

  const dialog = await screen.findByRole('dialog', { name: /All organizations/i });
  expect(dialog).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Acme/ })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: /Xylo/ }));

  expect(switchMutate).toHaveBeenCalledWith('org_x');
});
