import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { MCPServerStatusIconProps } from '~/components/MCP/MCPServerStatusIcon';
import type { MCPServerDefinition } from '~/hooks';
import MCPServerCard from './MCPServerCard';

const mockInitializeServer = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useMCPServerManager: () => ({
    initializeServer: mockInitializeServer,
    revokeOAuthForServer: jest.fn(),
    getOAuthUrl: () => null,
  }),
}));

jest.mock('@librechat/client', () => ({
  MCPIcon: () => <span />,
}));

jest.mock('./MCPCardActions', () => ({
  __esModule: true,
  default: ({ onInitialize }: { onInitialize: () => void }) => (
    <button type="button" onClick={onInitialize}>
      {'com_nav_mcp_connect'}
    </button>
  ),
}));

jest.mock('./MCPServerDialog', () => ({ __esModule: true, default: () => null }));
jest.mock('./MCPStatusBadge', () => ({ getStatusDotColor: () => '' }));
jest.mock('~/components/ui/CustomIcon', () => ({ __esModule: true, default: () => null }));
jest.mock('~/components/MCP/McpOAuthDialog', () => ({
  __esModule: true,
  default: ({ open, oauthUrl }: { open: boolean; oauthUrl: string }) =>
    open ? <div role="dialog">{oauthUrl}</div> : null,
}));

const server = {
  serverName: 'clickhouse',
  config: {},
  effectivePermissions: 0,
} as unknown as MCPServerDefinition;

const statusProps = (isInitializing: boolean) =>
  ({
    serverName: 'clickhouse',
    serverStatus: { connectionState: 'disconnected', requiresOAuth: true },
    onConfigClick: jest.fn(),
    isInitializing,
    canCancel: true,
    onCancel: jest.fn(),
    hasCustomUserVars: false,
  }) as unknown as MCPServerStatusIconProps;

const renderCard = (isInitializing: boolean) => (
  <MCPServerCard
    server={server}
    getServerStatusIconProps={() => statusProps(isInitializing)}
    canCreateEditMCPs={false}
  />
);

describe('MCPServerCard', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('surfaces the authorization URL in the OAuth dialog instead of opening a tab', async () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    mockInitializeServer.mockResolvedValue({
      success: true,
      oauthRequired: true,
      oauthUrl: 'https://auth.example/authorize',
    });
    const { rerender } = render(renderCard(false));

    fireEvent.click(screen.getByText('com_nav_mcp_connect'));
    await waitFor(() => expect(mockInitializeServer).toHaveBeenCalledWith('clickhouse', false));
    rerender(renderCard(true));

    expect(await screen.findByRole('dialog')).toHaveTextContent('https://auth.example/authorize');
    expect(open).not.toHaveBeenCalled();

    rerender(renderCard(false));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    open.mockRestore();
  });

  test('keeps the OAuth dialog closed when connecting needs no authorization', async () => {
    mockInitializeServer.mockResolvedValue({ success: true, oauthRequired: false });
    const { rerender } = render(renderCard(false));

    fireEvent.click(screen.getByText('com_nav_mcp_connect'));
    await waitFor(() => expect(mockInitializeServer).toHaveBeenCalled());
    rerender(renderCard(true));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
