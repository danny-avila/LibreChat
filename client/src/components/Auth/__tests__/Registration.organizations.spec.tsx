import userEvent from '@testing-library/user-event';
import { OrganizationInviteKind } from 'librechat-data-provider';
import * as mockDataProvider from 'librechat-data-provider/react-query';
import * as organizationQueries from '~/data-provider/Organizations/queries';
import { render, screen, waitFor } from 'test/layout-test-utils';
import * as authQueries from '~/data-provider/Auth/queries';
import Registration from '~/components/Auth/Registration';

jest.mock('librechat-data-provider/react-query');

const startupConfig = {
  registrationEnabled: true,
  serverDomain: 'mock-server',
  organizations: { enabled: true, allowCreate: true, allowLinkInvites: true, maxPerAccount: 10 },
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  __esModule: true,
  useOutletContext: () => ({ startupConfig, startupConfigError: null, isFetching: false }),
}));

const mutate = jest.fn();

function setup({ invite }: { invite?: string } = {}) {
  window.history.pushState({}, '', invite ? `/register?invite=${invite}` : '/register');
  jest
    .spyOn(mockDataProvider, 'useRegisterUserMutation')
    //@ts-ignore - only the fields the form reads
    .mockReturnValue({ mutate, isLoading: false, isSuccess: false, error: null });
  jest
    .spyOn(authQueries, 'useGetUserQuery')
    //@ts-ignore - only the fields the form reads
    .mockReturnValue({ isLoading: false, isError: false, data: {} });
  return render(<Registration />);
}

async function fillAccountFields() {
  await userEvent.type(screen.getByRole('textbox', { name: /Full name/i }), 'Bob Builder');
  await userEvent.type(screen.getByTestId('password'), 'Password123!');
  await userEvent.type(screen.getByTestId('confirm_password'), 'Password123!');
}

beforeEach(() => {
  mutate.mockClear();
  jest.restoreAllMocks();
});

test('asks for the organization the new account will run', async () => {
  jest
    .spyOn(organizationQueries, 'useOrganizationInvitePreviewQuery')
    //@ts-ignore - no invite on this page
    .mockReturnValue({ data: undefined, error: null });
  setup();

  const organizationField = screen.getByRole('textbox', { name: /Organization name/i });
  await userEvent.type(organizationField, '  Acme Inc  ');
  await userEvent.type(screen.getByRole('textbox', { name: /Email/i }), 'bob@example.com');
  await fillAccountFields();
  await userEvent.click(screen.getByRole('button', { name: /Submit registration/i }));

  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate.mock.calls[0][0]).toMatchObject({
    email: 'bob@example.com',
    organization: { name: '  Acme Inc  ' },
  });
  expect(mutate.mock.calls[0][0]).not.toHaveProperty('organizationName');
});

test('refuses an organization name that is too short', async () => {
  jest
    .spyOn(organizationQueries, 'useOrganizationInvitePreviewQuery')
    //@ts-ignore - no invite on this page
    .mockReturnValue({ data: undefined, error: null });
  setup();

  await userEvent.type(screen.getByRole('textbox', { name: /Organization name/i }), 'A');

  expect(await screen.findByText(/must be 2 to 80 characters/i)).toBeInTheDocument();
});

test('joins the inviting organization with an email invite, its address locked', async () => {
  jest
    .spyOn(organizationQueries, 'useOrganizationInvitePreviewQuery')
    //@ts-ignore - only the fields the form reads
    .mockReturnValue({
      data: {
        organization: { id: 'org_a', name: 'Acme' },
        kind: OrganizationInviteKind.EMAIL,
        email: 'bob@example.com',
      },
      error: null,
    });
  setup({ invite: 'abc123' });

  expect(screen.getByTestId('invite-join')).toHaveTextContent('Join Acme');
  expect(screen.queryByRole('textbox', { name: /Organization name/i })).not.toBeInTheDocument();
  const email = screen.getByRole('textbox', { name: /Email/i });
  await waitFor(() => expect(email).toHaveValue('bob@example.com'));
  expect(email).toHaveAttribute('readonly');

  await fillAccountFields();
  await userEvent.click(screen.getByRole('button', { name: /Submit registration/i }));

  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate.mock.calls[0][0]).toMatchObject({
    email: 'bob@example.com',
    organizationInvite: 'abc123',
  });
  expect(mutate.mock.calls[0][0]).not.toHaveProperty('organization');
});

test('explains an invite that can no longer be used', () => {
  jest
    .spyOn(organizationQueries, 'useOrganizationInvitePreviewQuery')
    //@ts-ignore - only the fields the form reads
    .mockReturnValue({
      data: undefined,
      error: { response: { status: 410, data: { code: 'INVITE_EXPIRED' } } },
    });
  setup({ invite: 'abc123' });

  expect(screen.getByText(/This invitation has expired/i)).toBeInTheDocument();
});
