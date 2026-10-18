import userEvent from '@testing-library/user-event';
import { ORGANIZATION_ONBOARDING_REQUIRED_CODE } from 'librechat-data-provider';
import type { TUser } from 'librechat-data-provider';
import {
  persistOnboardingToken,
  persistPendingInviteToken,
  startOrganizationOnboarding,
} from '~/utils/organizations';
import * as organizationMutations from '~/data-provider/Organizations/mutations';
import * as organizationQueries from '~/data-provider/Organizations/queries';
import { act, render, screen } from 'test/layout-test-utils';
import { loadAppPath } from '~/utils/navigation';
import Onboarding from '../Onboarding';

jest.mock('~/utils/navigation', () => ({ loadAppPath: jest.fn() }));

const mockSetHeaderText = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  __esModule: true,
  useOutletContext: () => ({ setHeaderText: mockSetHeaderText }),
}));

const createMutate = jest.fn();
const acceptPendingMutate = jest.fn();
const acceptLinkMutate = jest.fn();
let createOptions: Parameters<typeof organizationMutations.useCreateOrganizationMutation>[1];

function setup({
  pendingInvites = [] as Array<{ id: string; organization: { name: string } }>,
} = {}) {
  jest
    .spyOn(organizationMutations, 'useCreateOrganizationMutation')
    //@ts-ignore - only the fields the page reads
    .mockImplementation((_token, options) => {
      createOptions = options;
      return { mutate: createMutate, isLoading: false };
    });
  jest
    .spyOn(organizationMutations, 'useAcceptPendingOrganizationInviteMutation')
    //@ts-ignore - only the fields the page reads
    .mockReturnValue({ mutate: acceptPendingMutate, isLoading: false });
  jest
    .spyOn(organizationMutations, 'useAcceptOrganizationInviteMutation')
    //@ts-ignore - only the fields the page reads
    .mockReturnValue({ mutate: acceptLinkMutate, isLoading: false });
  jest
    .spyOn(organizationQueries, 'usePendingOrganizationInvitesQuery')
    //@ts-ignore - only the fields the page reads
    .mockReturnValue({ data: { invites: pendingInvites } });
  jest
    .spyOn(organizationQueries, 'useOrganizationInvitePreviewQuery')
    //@ts-ignore - only the fields the page reads
    .mockImplementation((token: string) => ({
      data: token ? { organization: { id: 'org_l', name: 'Linked' }, kind: 'link' } : undefined,
    }));
  return render(<Onboarding />);
}

beforeEach(() => {
  jest.restoreAllMocks();
  sessionStorage.clear();
  createMutate.mockClear();
  acceptPendingMutate.mockClear();
  acceptLinkMutate.mockClear();
  (loadAppPath as jest.Mock).mockClear();
});

test('sends an expired or missing onboarding session back to sign-in', () => {
  setup();

  expect(screen.getByText(/Your sign-in has expired/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Back to Login/i })).toBeInTheDocument();
});

test('tells an unverified account to verify before it can create, while invites still work', async () => {
  startOrganizationOnboarding({
    code: ORGANIZATION_ONBOARDING_REQUIRED_CODE,
    onboardingToken: 'onboarding-token',
    emailVerified: false,
  });
  setup({ pendingInvites: [{ id: 'inv-1', organization: { name: 'Acme' } }] });

  expect(screen.getByRole('status')).toHaveTextContent(/Verify your email address/i);
  expect(screen.queryByTestId('organization-name')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Join/i }));
  expect(acceptPendingMutate).toHaveBeenCalledWith('inv-1');
});

test('creates an organization with a valid name and enters it', async () => {
  persistOnboardingToken('onboarding-token');
  setup();

  const submit = screen.getByRole('button', { name: /Create organization/i });
  expect(submit).toBeDisabled();
  await userEvent.type(screen.getByTestId('organization-name'), '  Acme  ');
  await userEvent.click(submit);

  expect(createMutate).toHaveBeenCalledWith({ name: 'Acme' });
  createOptions?.onSuccess?.(
    { token: 't', user: {} as TUser, organization: { id: 'org_a', name: 'Acme' } },
    { name: 'Acme' },
    undefined,
  );
  expect(loadAppPath).toHaveBeenCalledWith('/c/new');
});

test('shows a refused creation with its reason', async () => {
  persistOnboardingToken('onboarding-token');
  setup();

  act(() => {
    createOptions?.onError?.(
      { response: { status: 403, data: { code: 'EMAIL_NOT_VERIFIED' } } },
      { name: 'Acme' },
      undefined,
    );
  });

  expect(await screen.findByText(/Verify your email address first/i)).toBeInTheDocument();
});

test('treats a rejected onboarding token as expired', async () => {
  persistOnboardingToken('onboarding-token');
  setup();

  act(() => {
    createOptions?.onError?.({ response: { status: 401 } }, { name: 'Acme' }, undefined);
  });

  expect(await screen.findByText(/Your sign-in has expired/i)).toBeInTheDocument();
});

test('offers the invite link opened before sign-in and pending invitations', async () => {
  persistOnboardingToken('onboarding-token');
  persistPendingInviteToken('link-token');
  setup({ pendingInvites: [{ id: 'invite-1', organization: { name: 'Pending Co' } }] });

  const joins = screen.getAllByRole('button', { name: 'Join' });
  expect(screen.getByText('Linked')).toBeInTheDocument();
  expect(screen.getByText('Pending Co')).toBeInTheDocument();

  await userEvent.click(joins[0]);
  await userEvent.click(joins[1]);

  expect(acceptLinkMutate).toHaveBeenCalledWith('link-token');
  expect(acceptPendingMutate).toHaveBeenCalledWith('invite-1');
});
