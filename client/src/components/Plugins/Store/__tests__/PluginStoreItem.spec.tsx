import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PluginStoreItem from '../PluginStoreItem';

const mockPlugin = {
  name: 'Test Plugin',
  description: 'This is a test plugin',
  icon: 'test-icon.png',
};

describe('PluginStoreItem', () => {
  it('renders the plugin name and description', () => {
    render(<PluginStoreItem plugin={mockPlugin} onInstall={() => {}} onUninstall={() => {}} />);
    expect(screen.getByText('Test Plugin')).toBeInTheDocument();
    expect(screen.getByText('This is a test plugin')).toBeInTheDocument();
  });

  it('calls onInstall when the install button is clicked', async () => {
    const onInstall = jest.fn();
    render(<PluginStoreItem plugin={mockPlugin} onInstall={onInstall} onUninstall={() => {}} />);
    await userEvent.click(screen.getByText('Install'));
    expect(onInstall).toHaveBeenCalled();
  });

  it('calls onUninstall when the uninstall button is clicked', async () => {
    const onUninstall = jest.fn();
    render(
      <PluginStoreItem
        plugin={mockPlugin}
        onInstall={() => {}}
        onUninstall={onUninstall}
        isInstalled
      />,
    );
    await userEvent.click(screen.getByText('Uninstall'));
    expect(onUninstall).toHaveBeenCalled();
  });
});
