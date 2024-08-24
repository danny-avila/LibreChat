import { render } from 'test/layout-test-utils';
import userEvent from '@testing-library/user-event';
import * as mockDataProvider from 'librechat-data-provider/react-query';
import type { TStartupConfig } from 'librechat-data-provider';
import Login from '../LoginForm';

jest.mock('librechat-data-provider/react-query');

const mockLogin = jest.fn();

const mockStartupConfig: TStartupConfig = {
  socialLogins: ['google', 'facebook', 'openid', 'github', 'discord'],
  discordLoginEnabled: true,
  facebookLoginEnabled: true,
  githubLoginEnabled: true,
  googleLoginEnabled: true,
  openidLoginEnabled: true,
  openidLabel: 'Test OpenID',
  openidImageUrl: 'http://test-server.com',
  registrationEnabled: true,
  emailLoginEnabled: true,
  socialLoginEnabled: true,
  passwordResetEnabled: true,
  serverDomain: 'mock-server',
  appTitle: '',
  ldap: {
    enabled: false,
  },
  emailEnabled: false,
  checkBalance: false,
  showBirthdayIcon: false,
};

const setup = ({
  useGetUserQueryReturnValue = {
    isLoading: false,
    isError: false,
    data: {},
  },
  useLoginUserReturnValue = {
    isLoading: false,
    isError: false,
    mutate: jest.fn(),
    data: {},
    isSuccess: false,
  },
  useRefreshTokenMutationReturnValue = {
    isLoading: false,
    isError: false,
    mutate: jest.fn(),
    data: {
      token: 'mock-token',
      user: {},
    },
  },
  useGetStartupConfigReturnValue = {
    isLoading: false,
    isError: false,
    data: mockStartupConfig,
  },
} = {}) => {
  const mockUseLoginUser = jest
    .spyOn(mockDataProvider, 'useLoginUserMutation')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useLoginUserReturnValue);
  const mockUseGetUserQuery = jest
    .spyOn(mockDataProvider, 'useGetUserQuery')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useGetUserQueryReturnValue);
  const mockUseGetStartupConfig = jest
    .spyOn(mockDataProvider, 'useGetStartupConfig')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useGetStartupConfigReturnValue);
  const mockUseRefreshTokenMutation = jest
    .spyOn(mockDataProvider, 'useRefreshTokenMutation')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useRefreshTokenMutationReturnValue);
  return {
    mockUseLoginUser,
    mockUseGetUserQuery,
    mockUseGetStartupConfig,
    mockUseRefreshTokenMutation,
  };
};

beforeEach(() => {
  setup();
});

test('renders login form', () => {
  const { getByLabelText } = render(
    <Login onSubmit={mockLogin} startupConfig={mockStartupConfig} />,
  );
  expect(getByLabelText(/email/i)).toBeInTheDocument();
  expect(getByLabelText(/password/i)).toBeInTheDocument();
});

test('submits login form', async () => {
  const { getByLabelText, getByRole } = render(
    <Login onSubmit={mockLogin} startupConfig={mockStartupConfig} />,
  );
  const emailInput = getByLabelText(/email/i);
  const passwordInput = getByLabelText(/password/i);
  const submitButton = getByRole('button', { name: /Sign in/i });

  await userEvent.type(emailInput, 'test@example.com');
  await userEvent.type(passwordInput, 'password');
  await userEvent.click(submitButton);

  expect(mockLogin).toHaveBeenCalledWith({ email: 'test@example.com', password: 'password' });
});

test('displays validation error messages', async () => {
  const { getByLabelText, getByRole, getByText } = render(
    <Login onSubmit={mockLogin} startupConfig={mockStartupConfig} />,
  );
  const emailInput = getByLabelText(/email/i);
  const passwordInput = getByLabelText(/password/i);
  const submitButton = getByRole('button', { name: /Sign in/i });

  await userEvent.type(emailInput, 'test');
  await userEvent.type(passwordInput, 'pass');
  await userEvent.click(submitButton);

  expect(getByText(/You must enter a valid email address/i)).toBeInTheDocument();
  expect(getByText(/Password must be at least 8 characters/i)).toBeInTheDocument();
});
