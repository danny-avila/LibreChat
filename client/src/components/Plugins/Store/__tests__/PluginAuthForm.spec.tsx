import { render, screen, waitFor } from 'layout-test-utils'; // Import waitFor from testing library
import userEvent from '@testing-library/user-event';
import PluginAuthForm from '../PluginAuthForm';

describe('PluginAuthForm', () => {
  const plugin = {
    pluginKey: 'test-plugin',
    authConfig: [
      {
        authField: 'key',
        label: 'Key',
      },
      {
        authField: 'secret',
        label: 'Secret',
      },
    ],
  };

  const onSubmit = jest.fn();

  // Reset the mock before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the form with the correct fields', () => {
    //@ts-ignore - dont need all props of plugin
    render(<PluginAuthForm plugin={plugin} onSubmit={onSubmit} />);

    expect(screen.getByLabelText('Key')).toBeInTheDocument();
    expect(screen.getByLabelText('Secret')).toBeInTheDocument();
  });

  it('calls the onSubmit function with the form data when submitted', async () => {
    //@ts-ignore - dont need all props of plugin
    render(<PluginAuthForm plugin={plugin} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Key'), '1234567890');
    await userEvent.type(screen.getByLabelText('Secret'), '1234567890');
    const saveButton = await screen.findByRole('button', { name: 'Save' });
    userEvent.click(saveButton);

    // Wait for the onSubmit function to be called
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        pluginKey: 'test-plugin',
        action: 'install',
        auth: {
          key: '1234567890',
          secret: '1234567890',
        },
      });
    });
  });
});
