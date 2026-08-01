import React from 'react';
import { render, screen } from '@testing-library/react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import MCPDeepLinkDialog from '../MCPDeepLinkDialog';

const mockUseHasAccess = jest.fn();

jest.mock('~/hooks', () => ({
  useHasAccess: (args: unknown) => mockUseHasAccess(args),
}));

jest.mock('../MCPServerDialog', () => ({
  __esModule: true,
  default: () => <div data-testid="mcp-server-dialog" />,
}));

const renderDialog = () =>
  render(
    <MCPDeepLinkDialog
      isOpen={true}
      initialValues={{ title: 'Server' }}
      onOpenChange={jest.fn()}
    />,
  );

describe('MCPDeepLinkDialog', () => {
  beforeEach(() => {
    mockUseHasAccess.mockReset();
  });

  it('renders only when the user has both use and create access', () => {
    mockUseHasAccess.mockImplementation(
      ({
        permissionType,
        permission,
      }: {
        permissionType: PermissionTypes;
        permission: Permissions;
      }) =>
        permissionType === PermissionTypes.MCP_SERVERS &&
        (permission === Permissions.CREATE || permission === Permissions.USE),
    );

    renderDialog();

    expect(screen.getByTestId('mcp-server-dialog')).toBeInTheDocument();
  });

  it.each([Permissions.CREATE, Permissions.USE])(
    'does not render when %s access is missing',
    (missingPermission) => {
      mockUseHasAccess.mockImplementation(
        ({ permission }: { permission: Permissions }) => permission !== missingPermission,
      );

      renderDialog();

      expect(screen.queryByTestId('mcp-server-dialog')).not.toBeInTheDocument();
    },
  );
});
