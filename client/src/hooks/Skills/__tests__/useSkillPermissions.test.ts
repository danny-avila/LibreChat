import { renderHook } from '@testing-library/react';
import { PermissionBits, SystemRoles } from 'librechat-data-provider';
import type { TSkill } from 'librechat-data-provider';
import useSkillPermissions from '../useSkillPermissions';

jest.mock('~/hooks/useResourcePermissions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: jest.fn(),
}));

import useResourcePermissions from '~/hooks/useResourcePermissions';
import { useAuthContext } from '~/hooks/AuthContext';

const useResourcePermissionsMock = useResourcePermissions as unknown as jest.Mock;
const useAuthContextMock = useAuthContext as unknown as jest.Mock;

function makeSkill(overrides: Partial<TSkill> = {}): TSkill {
  return {
    _id: 'skill-1',
    name: 'example-skill',
    description: 'A skill for the test.',
    body: '# Overview',
    author: 'user-owner',
    authorName: 'Owner',
    version: 1,
    source: 'inline',
    fileCount: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockUser(id: string, role: SystemRoles = SystemRoles.USER) {
  useAuthContextMock.mockReturnValue({
    user: { id, role },
    roles: { [role]: {} },
  });
}

function mockPermissions(bits: number, isLoading = false) {
  useResourcePermissionsMock.mockReturnValue({
    hasPermission: (required: number) => (bits & required) === required,
    isLoading,
    permissionBits: bits,
  });
}

describe('useSkillPermissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('grants full control to the skill author regardless of ACL bits', () => {
    mockUser('user-owner');
    mockPermissions(0);
    const { result } = renderHook(() => useSkillPermissions(makeSkill()));
    expect(result.current.isOwner).toBe(true);
    expect(result.current.canEdit).toBe(true);
    expect(result.current.canDelete).toBe(true);
    expect(result.current.canShare).toBe(true);
  });

  it('grants full control to an admin regardless of ownership', () => {
    mockUser('user-other', SystemRoles.ADMIN);
    mockPermissions(0);
    const { result } = renderHook(() => useSkillPermissions(makeSkill()));
    expect(result.current.isOwner).toBe(false);
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.canEdit).toBe(true);
    expect(result.current.canDelete).toBe(true);
    expect(result.current.canShare).toBe(true);
  });

  it('grants EDIT without DELETE/SHARE when the ACL only carries EDIT bits', () => {
    mockUser('user-editor');
    mockPermissions(PermissionBits.VIEW | PermissionBits.EDIT);
    const { result } = renderHook(() => useSkillPermissions(makeSkill()));
    expect(result.current.isOwner).toBe(false);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.canEdit).toBe(true);
    expect(result.current.canDelete).toBe(false);
    expect(result.current.canShare).toBe(false);
  });

  it('grants view-only when the ACL only carries VIEW bits', () => {
    mockUser('user-viewer');
    mockPermissions(PermissionBits.VIEW);
    const { result } = renderHook(() => useSkillPermissions(makeSkill()));
    expect(result.current.canEdit).toBe(false);
    expect(result.current.canDelete).toBe(false);
    expect(result.current.canShare).toBe(false);
  });

  it('grants DELETE + SHARE when the ACL owner role bits are present', () => {
    mockUser('user-owner-acl');
    mockPermissions(
      PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE,
    );
    const { result } = renderHook(() => useSkillPermissions(makeSkill()));
    expect(result.current.canEdit).toBe(true);
    expect(result.current.canDelete).toBe(true);
    expect(result.current.canShare).toBe(true);
  });

  it('returns denied permissions while the ACL query is still loading', () => {
    mockUser('user-other');
    mockPermissions(0, /* isLoading */ true);
    const { result } = renderHook(() => useSkillPermissions(makeSkill()));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.canEdit).toBe(false);
    expect(result.current.canDelete).toBe(false);
    expect(result.current.canShare).toBe(false);
  });

  it('handles an undefined skill gracefully', () => {
    mockUser('user-other');
    mockPermissions(0);
    const { result } = renderHook(() => useSkillPermissions(undefined));
    expect(result.current.isOwner).toBe(false);
    expect(result.current.canEdit).toBe(false);
    expect(result.current.canDelete).toBe(false);
    expect(result.current.canShare).toBe(false);
  });
});
