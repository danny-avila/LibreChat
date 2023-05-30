import { render } from 'layout-test-utils';
import Login from '../Login';

test('renders login form', () => {
  const { getByLabelText } = render(<Login />);
  expect(getByLabelText(/email/i)).toBeInTheDocument();
  expect(getByLabelText(/password/i)).toBeInTheDocument();
});
