import { render, screen } from 'test/layout-test-utils';
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

  it('renders the form with the correct fields', () => {
    //@ts-ignore - dont need all props of plugin
    render(<PluginAuthForm plugin={plugin} onSubmit={onSubmit} />);

    expect(screen.getByLabelText('Key')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Secret')).toHaveAttribute('type', 'password');
  });

  it('masks fields by default and renders non-sensitive fields as plain text', () => {
    const mixedPlugin = {
      pluginKey: 'mixed-plugin',
      authConfig: [
        { authField: 'token', label: 'Token' },
        { authField: 'secret', label: 'Secret', sensitive: true },
        { authField: 'url', label: 'URL', sensitive: false },
      ],
    };

    //@ts-ignore - dont need all props of plugin
    render(<PluginAuthForm plugin={mixedPlugin} onSubmit={onSubmit} />);

    expect(screen.getByLabelText('Token')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Secret')).toHaveAttribute('type', 'password');

    const urlField = screen.getByLabelText('URL');
    expect(urlField).toHaveAttribute('type', 'text');
    expect(urlField.parentElement?.querySelector('button')).toBeNull();
  });

  it('calls the onSubmit function with the form data when submitted', async () => {
    //@ts-ignore - dont need all props of plugin
    render(<PluginAuthForm plugin={plugin} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Key'), '1234567890');
    await userEvent.type(screen.getByLabelText('Secret'), '1234567890');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({
      pluginKey: 'test-plugin',
      action: 'install',
      auth: {
        key: '1234567890',
        // file deepcode ignore HardcodedNonCryptoSecret/test: test
        secret: '1234567890',
      },
    });
  });
});
