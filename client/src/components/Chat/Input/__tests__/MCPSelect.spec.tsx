import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockToggleServerSelection = jest.fn();
const mockGetServerStatusIconProps = jest.fn().mockReturnValue(null);
const mockGetConfigDialogProps = jest.fn().mockReturnValue(null);
const mockIsInitializing = jest.fn().mockReturnValue(false);

jest.mock('~/Providers', () => ({
  useBadgeRowContext: () => ({
    conversationId: 'test-conv',
    storageContextKey: undefined,
    mcpServerManager: {
      localize: (key: string) => key,
      isPinned: true,
      mcpValues: [],
      placeholderText: 'MCP Servers',
      selectableServers: [
        { serverName: 'server-a', config: { title: 'Server A' } },
        { serverName: 'server-b', config: { title: 'Server B' } },
      ],
      connectionStatus: {},
      isInitializing: mockIsInitializing,
      getConfigDialogProps: mockGetConfigDialogProps,
      toggleServerSelection: mockToggleServerSelection,
      getServerStatusIconProps: mockGetServerStatusIconProps,
    },
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useHasAccess: () => true,
}));

jest.mock('@librechat/client', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    TooltipAnchor: jest.fn(({ children, render }) => R.cloneElement(render, {}, children)),
    MCPIcon: ({ className }: { className?: string }) => R.createElement('span', { className }),
    Spinner: ({ className }: { className?: string }) => R.createElement('span', { className }),
  };
});

jest.mock('~/components/MCP/MCPConfigDialog', () => ({
  __esModule: true,
  default: () => null,
}));

import MCPSelect from '../MCPSelect';

describe('MCPSelect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the menu button', () => {
    render(<MCPSelect />);
    expect(screen.getByRole('button', { name: /MCP Servers/i })).toBeInTheDocument();
  });

  it('opens menu on button click and shows server items', async () => {
    const user = userEvent.setup();
    render(<MCPSelect />);

    await user.click(screen.getByRole('button', { name: /MCP Servers/i }));

    const menu = screen.getByRole('menu', { name: /com_ui_mcp_servers/i });
    expect(menu).toBeVisible();
    expect(within(menu).getByRole('menuitemcheckbox', { name: /Server A/i })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitemcheckbox', { name: /Server B/i })).toBeInTheDocument();
  });

  it('closes menu on Escape', async () => {
    const user = userEvent.setup();
    render(<MCPSelect />);

    await user.click(screen.getByRole('button', { name: /MCP Servers/i }));
    expect(screen.getByRole('menu', { name: /com_ui_mcp_servers/i })).toBeVisible();

    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /MCP Servers/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('keeps menu open after toggling a server item', async () => {
    const user = userEvent.setup();
    render(<MCPSelect />);

    await user.click(screen.getByRole('button', { name: /MCP Servers/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Server A/i }));

    expect(mockToggleServerSelection).toHaveBeenCalledWith('server-a');
    expect(screen.getByRole('menu', { name: /com_ui_mcp_servers/i })).toBeVisible();
  });
});
