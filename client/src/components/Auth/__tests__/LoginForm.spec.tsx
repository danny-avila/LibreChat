import { render } from 'layout-test-utils';
import userEvent from '@testing-library/user-event';
import Login from '../LoginForm';

const mockLogin = jest.fn();

test('renders login form', () => {
  const { getByLabelText } = render(<Login onSubmit={mockLogin} />);
  expect(getByLabelText(/email/i)).toBeInTheDocument();
  expect(getByLabelText(/password/i)).toBeInTheDocument();
});

test('submits login form', async () => {
  const { getByLabelText, getByRole } = render(<Login onSubmit={mockLogin} />);
  const emailInput = getByLabelText(/email/i);
  const passwordInput = getByLabelText(/password/i);
  const submitButton = getByRole('button', { name: /Sign in/i });

  await userEvent.type(emailInput, 'test@example.com');
  await userEvent.type(passwordInput, 'password');
  await userEvent.click(submitButton);

  expect(mockLogin).toHaveBeenCalledWith({ email: 'test@example.com', password: 'password' });
});

test('displays validation error messages', async () => {
  const { getByLabelText, getByRole, getByText } = render(<Login onSubmit={mockLogin} />);
  const emailInput = getByLabelText(/email/i);
  const passwordInput = getByLabelText(/password/i);
  const submitButton = getByRole('button', { name: /Sign in/i });

  await userEvent.type(emailInput, 'test');
  await userEvent.type(passwordInput, 'pass');
  await userEvent.click(submitButton);

  expect(getByText(/You must enter a valid email address/i)).toBeInTheDocument();
  expect(getByText(/Password must be at least 8 characters/i)).toBeInTheDocument();
});
