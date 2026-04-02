import { renderHook } from '@testing-library/react';
import { PermissionBits } from 'librechat-data-provider';

jest.mock('~/hooks/Roles', () => ({
  useHasAccess: jest.fn(),
}));

import { useHasAccess } from '~/hooks/Roles';
import useAgentDefaultPermissionLevel from '../useAgentDefaultPermissionLevel';
const mockUseHasAccess = useHasAccess as jest.Mock;

describe('useAgentDefaultPermissionLevel', () => {
  it('should return EDIT permission when marketplace access is enabled', () => {
    mockUseHasAccess.mockReturnValue(true);
    const { result } = renderHook(() => useAgentDefaultPermissionLevel());
    expect(result.current).toBe(PermissionBits.EDIT);
  });

  it('should return VIEW permission when marketplace access is disabled', () => {
    mockUseHasAccess.mockReturnValue(false);
    const { result } = renderHook(() => useAgentDefaultPermissionLevel());
    expect(result.current).toBe(PermissionBits.VIEW);
  });
});
