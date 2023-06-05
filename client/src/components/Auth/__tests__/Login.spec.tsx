import { render, waitFor, screen } from 'layout-test-utils';
import userEvent from '@testing-library/user-event';
import Login from '../Login';
import * as mockDataProvider from '~/data-provider';

jest.mock('~/utils/envConstants', () => ({
  DOMAIN_SERVER: 'mock-server',
  SHOW_GOOGLE_LOGIN_OPTION: true,
  ALLOW_REGISTRATION: true
}));

jest.mock('~/data-provider');

const setup = ({
  useGetUserQueryReturnValue = {
    isLoading: false,
    isError: false,
    data: {}
  },
  useLoginUserReturnValue = {
    isLoading: false,
    isError: false,
    mutate: jest.fn(),
    data: {},
    isSuccess: false
  }
} = {}) => {
  const mockUseLoginUser = jest
    .spyOn(mockDataProvider, 'useLoginUserMutation')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useLoginUserReturnValue);
  const mockUseGetUserQuery = jest
    .spyOn(mockDataProvider, 'useGetUserQuery')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useGetUserQueryReturnValue);
  const renderResult = render(<Login />);

  return {
    ...renderResult,
    mockUseLoginUser,
    mockUseGetUserQuery
  };
};

test('renders login form', () => {
  const { getByLabelText, getByRole } = setup();
  expect(getByLabelText(/email/i)).toBeInTheDocument();
  expect(getByLabelText(/password/i)).toBeInTheDocument();
  expect(getByRole('button', { name: /Sign in/i })).toBeInTheDocument();
  expect(getByRole('link', { name: /Sign up/i })).toBeInTheDocument();
  expect(getByRole('link', { name: /Sign up/i })).toHaveAttribute('href', '/register');
  expect(getByRole('link', { name: /Login with Google/i })).toBeInTheDocument();
  expect(getByRole('link', { name: /Login with Google/i })).toHaveAttribute(
    'href',
    'mock-server/oauth/google'
  );
});

test('calls loginUser.mutate on login', async () => {
  const mutate = jest.fn();
  const { getByLabelText, getByRole } = setup({
    // @ts-ignore - we don't need all parameters of the QueryObserverResult
    useLoginUserReturnValue: {
      isLoading: false,
      mutate: mutate,
      isError: false
    }
  });

  const emailInput = getByLabelText(/email/i);
  const passwordInput = getByLabelText(/password/i);
  const submitButton = getByRole('button', { name: /Sign in/i });

  await userEvent.type(emailInput, 'test@test.com');
  await userEvent.type(passwordInput, 'password');
  await userEvent.click(submitButton);

  waitFor(() => expect(mutate).toHaveBeenCalled());
});

test('Navigates to / on successful login', async () => {
  const { getByLabelText, getByRole, history } = setup({
    // @ts-ignore - we don't need all parameters of the QueryObserverResult
    useLoginUserReturnValue: {
      isLoading: false,
      mutate: jest.fn(),
      isError: false,
      isSuccess: true
    }
  });

  const emailInput = getByLabelText(/email/i);
  const passwordInput = getByLabelText(/password/i);
  const submitButton = getByRole('button', { name: /Sign in/i });

  await userEvent.type(emailInput, 'test@test.com');
  await userEvent.type(passwordInput, 'password');
  await userEvent.click(submitButton);

  waitFor(() => expect(history.location.pathname).toBe('/'));
});
