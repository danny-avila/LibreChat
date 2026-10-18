import userEvent from '@testing-library/user-event';
import { getPendingInviteToken, persistOnboardingToken } from '~/utils/organizations';
import * as organizationMutations from '~/data-provider/Organizations/mutations';
import * as organizationQueries from '~/data-provider/Organizations/queries';
import { render, screen } from 'test/layout-test-utils';
import OrganizationInvite from '../OrganizationInvite';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  __esModule: true,
  useNavigate: () => mockNavigate,
  useParams: () => ({ token: 'abc123' }),
  useOutletContext: () => ({ setHeaderText: jest.fn() }),
}));

const acceptMutate = jest.fn();

function setup(preview: { data?: unknown; error?: unknown; isLoading?: boolean }) {
  jest
    .spyOn(organizationQueries, 'useOrganizationInvitePreviewQuery')
    //@ts-ignore - only the fields the page reads
    .mockReturnValue({ isLoading: false, error: null, ...preview });
  jest
    .spyOn(organizationMutations, 'useAcceptOrganizationInviteMutation')
    //@ts-ignore - only the fields the page reads
    .mockReturnValue({ mutate: acceptMutate, isLoading: false, error: null });
  return render(<OrganizationInvite />);
}

const preview = {
  organization: { id: 'org_a', name: 'Acme' },
  kind: 'email',
  inviterName: 'Alice',
  email: 'bob@example.com',
};

beforeEach(() => {
  jest.restoreAllMocks();
  sessionStorage.clear();
  mockNavigate.mockClear();
  acceptMutate.mockClear();
});

test('shows who invited you to which organization, and to which address', () => {
  setup({ data: preview });

  expect(screen.getByText('Alice invited you to join Acme.')).toBeInTheDocument();
  expect(screen.getByText('This invitation is for bob@example.com.')).toBeInTheDocument();
});

test('signs in to accept, coming back to the accept page', async () => {
  setup({ data: preview });

  await userEvent.click(screen.getByRole('button', { name: 'Sign in to accept' }));

  expect(getPendingInviteToken()).toBe('abc123');
  expect(mockNavigate).toHaveBeenCalledWith(
    `/login?redirect_to=${encodeURIComponent('/invite/abc123/accept')}`,
  );
});

test('creates an account through the invite', async () => {
  setup({ data: preview });

  await userEvent.click(screen.getByRole('button', { name: 'Create an account' }));

  expect(mockNavigate).toHaveBeenCalledWith('/register?invite=abc123');
});

test('accepts directly for an account still onboarding', async () => {
  persistOnboardingToken('onboarding-token');
  setup({ data: preview });

  await userEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));

  expect(acceptMutate).toHaveBeenCalledWith('abc123');
  expect(screen.queryByRole('button', { name: 'Sign in to accept' })).not.toBeInTheDocument();
});

test('explains an invitation that is gone', () => {
  setup({ error: { response: { status: 404, data: { code: 'INVITE_NOT_FOUND' } } } });

  expect(screen.getByText('This invitation is no longer available.')).toBeInTheDocument();
});
