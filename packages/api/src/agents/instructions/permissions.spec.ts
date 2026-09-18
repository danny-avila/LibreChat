import { Permissions, PermissionTypes, SystemRoles } from 'librechat-data-provider';
import type { RequestRoleCache } from '../../middleware/access';
import { createPromptUseChecker } from './permissions';

describe('createPromptUseChecker', () => {
  it('allows administrators without a role lookup', async () => {
    const getRoleByName = jest.fn();

    await expect(
      createPromptUseChecker(getRoleByName)({ userId: 'admin-1', role: SystemRoles.ADMIN }),
    ).resolves.toBe(true);
    expect(getRoleByName).not.toHaveBeenCalled();
  });

  it('denies requests without a role', async () => {
    const getRoleByName = jest.fn();

    await expect(createPromptUseChecker(getRoleByName)({ userId: 'user-1' })).resolves.toBe(false);
    expect(getRoleByName).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'returns the role prompt-use permission when it is %s',
    async (allowed) => {
      const getRoleByName = jest.fn().mockResolvedValue({
        permissions: {
          [PermissionTypes.PROMPTS]: {
            [Permissions.USE]: allowed,
          },
        },
      });

      await expect(
        createPromptUseChecker(getRoleByName)({ userId: 'user-1', role: SystemRoles.USER }),
      ).resolves.toBe(allowed);
      expect(getRoleByName).toHaveBeenCalledWith(SystemRoles.USER);
    },
  );

  it('reuses an in-flight role lookup across prompt resolutions in one request', async () => {
    const getRoleByName = jest.fn().mockResolvedValue({
      permissions: {
        [PermissionTypes.PROMPTS]: {
          [Permissions.USE]: true,
        },
      },
    });
    const roleCache: RequestRoleCache = new Map();
    const canUsePrompts = createPromptUseChecker(getRoleByName);

    await expect(
      Promise.all([
        canUsePrompts({ userId: 'user-1', role: SystemRoles.USER, roleCache }),
        canUsePrompts({ userId: 'user-1', role: SystemRoles.USER, roleCache }),
      ]),
    ).resolves.toEqual([true, true]);
    expect(getRoleByName).toHaveBeenCalledTimes(1);
  });
});
