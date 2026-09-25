import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { render, screen } from '@testing-library/react';
import type { MCPServerStatus } from 'librechat-data-provider';
import MCPCardActions from './MCPCardActions';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => ({
  Spinner: (props: React.ComponentProps<'span'>) => <span {...props} />,
  TooltipAnchor: ({
    children,
    description: _description,
    side: _side,
    ...props
  }: React.ComponentProps<'div'> & { description: string; side?: string }) => (
    <div {...props}>{children}</div>
  ),
}));

const connectedOAuthStatus = {
  connectionState: 'connected',
  requiresOAuth: true,
} as MCPServerStatus;

describe('MCPCardActions', () => {
  test('revoke icon keeps its destructive color while hovered', () => {
    render(
      <MCPCardActions
        serverName="server"
        serverStatus={connectedOAuthStatus}
        isInitializing={false}
        canCancel={false}
        hasCustomUserVars={false}
        canEdit={false}
        onEditClick={jest.fn()}
        onConfigClick={jest.fn()}
        onInitialize={jest.fn()}
        onCancel={jest.fn()}
        onRevoke={jest.fn()}
      />,
    );

    const revokeButton = screen.getByRole('button', { name: 'com_ui_revoke' });
    expect(revokeButton).toHaveClass('hover:text-text-secondary');
    expect(revokeButton.querySelector('svg')).toHaveClass('text-text-destructive');
  });

  test.each([
    ['disconnected', 'com_nav_mcp_connect'],
    ['error', 'com_nav_mcp_connect'],
    ['connected', 'com_nav_mcp_reconnect'],
  ] as const)(
    'does not render a manual connection action when %s and on-demand',
    (state, label) => {
      render(
        <MCPCardActions
          serverName="server"
          serverStatus={{
            connectionState: state,
            requiresOAuth: false,
            requestScoped: true,
          }}
          isInitializing={false}
          canCancel={false}
          hasCustomUserVars={false}
          canEdit={false}
          onEditClick={jest.fn()}
          onConfigClick={jest.fn()}
          onInitialize={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    },
  );

  test('keeps custom-variable configuration available while an on-demand server is idle', () => {
    render(
      <MCPCardActions
        serverName="server"
        serverStatus={{
          connectionState: 'disconnected',
          requiresOAuth: false,
          requestScoped: true,
          configurationState: 'needs_configuration',
        }}
        isInitializing={false}
        canCancel={false}
        hasCustomUserVars={true}
        canEdit={false}
        onEditClick={jest.fn()}
        onConfigClick={jest.fn()}
        onInitialize={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'com_ui_configure' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'com_nav_mcp_connect' })).not.toBeInTheDocument();
  });
});
