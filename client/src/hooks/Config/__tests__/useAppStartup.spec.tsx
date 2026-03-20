import React from 'react';
import { RecoilRoot } from 'recoil';
import { renderHook } from '@testing-library/react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { TUser } from 'librechat-data-provider';

const mockUseHasAccess = jest.fn();
const mockUseMCPServersQuery = jest.fn();
const mockUseMCPToolsQuery = jest.fn();

jest.mock('~/hooks', () => ({
  useHasAccess: (args: unknown) => mockUseHasAccess(args),
}));

jest.mock('~/data-provider', () => ({
  useMCPServersQuery: (config: unknown) => mockUseMCPServersQuery(config),
  useMCPToolsQuery: (config: unknown) => mockUseMCPToolsQuery(config),
}));

jest.mock('../useSpeechSettingsInit', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('~/utils/timestamps', () => ({
  cleanupTimestampedStorage: jest.fn(),
}));

jest.mock('react-gtm-module', () => ({
  __esModule: true,
  default: { initialize: jest.fn() },
}));

import useAppStartup from '../useAppStartup';

const mockUser = {
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
  name: 'Test User',
  avatar: '',
  role: 'USER',
  provider: 'local',
  emailVerified: true,
  createdAt: '2023-01-01T00:00:00.000Z',
  updatedAt: '2023-01-01T00:00:00.000Z',
} as TUser;

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

describe('useAppStartup — MCP permission gating', () => {
  beforeEach(() => {
    mockUseMCPServersQuery.mockReturnValue({ data: undefined, isLoading: false });
    mockUseMCPToolsQuery.mockReturnValue({ data: undefined, isLoading: false });
  });

  it('checks the MCP_SERVERS.USE permission via useHasAccess', () => {
    mockUseHasAccess.mockReturnValue(false);

    renderHook(() => useAppStartup({ startupConfig: undefined, user: mockUser }), { wrapper });

    expect(mockUseHasAccess).toHaveBeenCalledWith({
      permissionType: PermissionTypes.MCP_SERVERS,
      permission: Permissions.USE,
    });
  });

  it('suppresses all MCP queries when user lacks MCP_SERVERS.USE', () => {
    mockUseHasAccess.mockReturnValue(false);

    renderHook(() => useAppStartup({ startupConfig: undefined, user: mockUser }), { wrapper });

    expect(mockUseMCPServersQuery).toHaveBeenCalledWith({ enabled: false });
    expect(mockUseMCPToolsQuery).toHaveBeenCalledWith({ enabled: false });
  });

  it('enables servers query and tools query when permission granted, servers loaded, and user present', () => {
    mockUseHasAccess.mockReturnValue(true);
    mockUseMCPServersQuery.mockReturnValue({
      data: { 'test-server': { url: 'http://test' } },
      isLoading: false,
    });

    renderHook(() => useAppStartup({ startupConfig: undefined, user: mockUser }), { wrapper });

    expect(mockUseMCPServersQuery).toHaveBeenCalledWith({ enabled: true });
    expect(mockUseMCPToolsQuery).toHaveBeenCalledWith({ enabled: true });
  });

  it('suppresses tools query when permission granted but user prop is undefined', () => {
    mockUseHasAccess.mockReturnValue(true);
    mockUseMCPServersQuery.mockReturnValue({
      data: { 'test-server': { url: 'http://test' } },
      isLoading: false,
    });

    renderHook(() => useAppStartup({ startupConfig: undefined, user: undefined }), { wrapper });

    expect(mockUseMCPServersQuery).toHaveBeenCalledWith({ enabled: true });
    expect(mockUseMCPToolsQuery).toHaveBeenCalledWith({ enabled: false });
  });

  it('suppresses tools query when permission granted but no servers loaded', () => {
    mockUseHasAccess.mockReturnValue(true);
    mockUseMCPServersQuery.mockReturnValue({ data: {}, isLoading: false });

    renderHook(() => useAppStartup({ startupConfig: undefined, user: mockUser }), { wrapper });

    expect(mockUseMCPServersQuery).toHaveBeenCalledWith({ enabled: true });
    expect(mockUseMCPToolsQuery).toHaveBeenCalledWith({ enabled: false });
  });

  it('suppresses tools query while servers are still loading', () => {
    mockUseHasAccess.mockReturnValue(true);
    mockUseMCPServersQuery.mockReturnValue({ data: undefined, isLoading: true });

    renderHook(() => useAppStartup({ startupConfig: undefined, user: mockUser }), { wrapper });

    expect(mockUseMCPToolsQuery).toHaveBeenCalledWith({ enabled: false });
  });
});
