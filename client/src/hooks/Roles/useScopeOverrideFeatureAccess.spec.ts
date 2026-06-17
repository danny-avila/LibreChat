import { renderHook } from '@testing-library/react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import useScopeOverrideFeatureAccess from './useScopeOverrideFeatureAccess';

const mockUseHasAccess = jest.fn();
const mockUseGetStartupConfig = jest.fn();

jest.mock('./useHasAccess', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockUseHasAccess(...args),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockUseGetStartupConfig(),
}));

describe('useScopeOverrideFeatureAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseHasAccess.mockReturnValue(true);
    mockUseGetStartupConfig.mockReturnValue({
      isLoading: false,
      data: {
        interface: {
          prompts: { use: true, create: true, share: false, public: false },
          skills: { use: true, create: true, share: false, public: false },
        },
      },
    });
  });

  it('allows CREATE when merged config explicitly enables it', () => {
    mockUseHasAccess.mockReturnValue(false);
    const { result } = renderHook(() =>
      useScopeOverrideFeatureAccess(PermissionTypes.PROMPTS, Permissions.CREATE),
    );
    expect(result.current).toBe(true);
  });

  it('blocks CREATE when merged config explicitly disables it', () => {
    mockUseHasAccess.mockReturnValue(true);
    mockUseGetStartupConfig.mockReturnValue({
      isLoading: false,
      data: {
        interface: {
          prompts: { use: true, create: false },
        },
      },
    });
    const { result } = renderHook(() =>
      useScopeOverrideFeatureAccess(PermissionTypes.PROMPTS, Permissions.CREATE),
    );
    expect(result.current).toBe(false);
  });

  it('defers to role when the config bit is absent', () => {
    mockUseHasAccess.mockReturnValue(true);
    mockUseGetStartupConfig.mockReturnValue({
      isLoading: false,
      data: {
        interface: {
          prompts: { use: true },
        },
      },
    });
    const { result } = renderHook(() =>
      useScopeOverrideFeatureAccess(PermissionTypes.PROMPTS, Permissions.CREATE),
    );
    expect(result.current).toBe(true);

    mockUseHasAccess.mockReturnValue(false);
    const { result: denied } = renderHook(() =>
      useScopeOverrideFeatureAccess(PermissionTypes.PROMPTS, Permissions.CREATE),
    );
    expect(denied.current).toBe(false);
  });

  it('blocks SHARE and SHARE_PUBLIC from merged config', () => {
    mockUseHasAccess.mockReturnValue(true);
    const { result: share } = renderHook(() =>
      useScopeOverrideFeatureAccess(PermissionTypes.PROMPTS, Permissions.SHARE),
    );
    expect(share.current).toBe(false);

    const { result: sharePublic } = renderHook(() =>
      useScopeOverrideFeatureAccess(PermissionTypes.PROMPTS, Permissions.SHARE_PUBLIC),
    );
    expect(sharePublic.current).toBe(false);
  });
});
