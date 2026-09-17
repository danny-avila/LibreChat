import { renderHook } from '@testing-library/react';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { useMediaProviderKeyScope } from '../useProviderKeys';

let mockUser: { id: string; tenantId: string } | null = { id: 'user', tenantId: 'tenant' };
let mockAuthenticated = true;
let mockCanUse = true;
let mockMediaEnabled = true;
const mockAccess = jest.fn<boolean, [unknown]>(() => mockCanUse);

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: mockUser, isAuthenticated: mockAuthenticated }),
  useHasAccess: (request: unknown) => mockAccess(request),
}));
jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: () => ({ data: {} }),
  useGetStartupConfig: () => ({
    data: {
      media: {
        enabled: mockMediaEnabled,
        clientPollIntervalMs: 5000,
        clientCatchUpIntervalMs: 60000,
      },
    },
  }),
}));

describe('Media provider key access', () => {
  beforeEach(() => {
    mockUser = { id: 'user', tenantId: 'tenant' };
    mockAuthenticated = true;
    mockCanUse = true;
    mockMediaEnabled = true;
  });

  it('allows Media-only settings without requiring agent or generation permission', () => {
    const { result } = renderHook(() => useMediaProviderKeyScope());
    expect(result.current?.scope).toBe(JSON.stringify(['tenant', 'user']));
    expect(result.current?.isCurrentSession()).toBe(true);
    expect(mockAccess).toHaveBeenCalledWith({
      permissionType: PermissionTypes.MEDIA,
      permission: Permissions.USE,
    });
  });

  it.each(['signed out', 'no user', 'no permission', 'Media disabled'])(
    'does not expose Media settings when %s',
    (reason) => {
      if (reason === 'signed out') mockAuthenticated = false;
      if (reason === 'no user') mockUser = null;
      if (reason === 'no permission') mockCanUse = false;
      if (reason === 'Media disabled') mockMediaEnabled = false;
      const { result } = renderHook(() => useMediaProviderKeyScope());
      expect(result.current).toBeUndefined();
    },
  );

  it('rejects results from the previous owner or tenant after a session switch', () => {
    const { result, rerender } = renderHook(() => useMediaProviderKeyScope());
    const oldScope = result.current;
    mockUser = { id: 'user', tenantId: 'other-tenant' };
    rerender();
    expect(oldScope?.isCurrentSession()).toBe(false);
    expect(result.current?.isCurrentSession()).toBe(true);
    const nextScope = result.current;
    mockCanUse = false;
    rerender();
    expect(result.current).toBeUndefined();
    expect(nextScope?.isCurrentSession()).toBe(false);
  });
});
