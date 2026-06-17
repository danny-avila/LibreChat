import { Permissions, PermissionTypes } from 'librechat-data-provider';
import {
  getInterfacePermissionBit,
  getInterfacePermissionUse,
  isInterfacePermissionEnabled,
  isInterfacePermissionUseEnabled,
  resolveScopeOverridePermission,
} from './permissions';

describe('interface permission helpers', () => {
  describe('getInterfacePermissionUse', () => {
    it('returns boolean values as-is', () => {
      expect(getInterfacePermissionUse(true)).toBe(true);
      expect(getInterfacePermissionUse(false)).toBe(false);
    });

    it('reads use from object config', () => {
      expect(getInterfacePermissionUse({ use: false })).toBe(false);
      expect(getInterfacePermissionUse({ use: true })).toBe(true);
    });

    it('returns undefined when config is absent', () => {
      expect(getInterfacePermissionUse(undefined)).toBeUndefined();
    });
  });

  describe('getInterfacePermissionBit', () => {
    it('reads create, share, and public from object config', () => {
      expect(
        getInterfacePermissionBit(
          { use: true, create: true, share: false, public: false },
          Permissions.CREATE,
        ),
      ).toBe(true);
      expect(
        getInterfacePermissionBit(
          { use: true, create: false, share: false, public: false },
          Permissions.CREATE,
        ),
      ).toBe(false);
      expect(getInterfacePermissionBit({ use: true, share: false }, Permissions.SHARE)).toBe(false);
      expect(
        getInterfacePermissionBit({ use: true, public: false }, Permissions.SHARE_PUBLIC),
      ).toBe(false);
    });

    it('treats boolean false as blocking every bit', () => {
      expect(getInterfacePermissionBit(false, Permissions.USE)).toBe(false);
      expect(getInterfacePermissionBit(false, Permissions.CREATE)).toBe(false);
      expect(getInterfacePermissionBit(false, Permissions.SHARE)).toBe(false);
    });

    it('defers non-use bits to role when config is boolean true', () => {
      expect(getInterfacePermissionBit(true, Permissions.USE)).toBe(true);
      expect(getInterfacePermissionBit(true, Permissions.CREATE)).toBeUndefined();
    });
  });

  describe('isInterfacePermissionEnabled', () => {
    it('treats explicit false as disabled', () => {
      expect(isInterfacePermissionEnabled(false, Permissions.CREATE)).toBe(false);
      expect(isInterfacePermissionEnabled({ create: false }, Permissions.CREATE)).toBe(false);
      expect(isInterfacePermissionEnabled({ share: false }, Permissions.SHARE)).toBe(false);
    });

    it('treats absent or enabled config as allowed at interface layer', () => {
      expect(isInterfacePermissionEnabled(undefined, Permissions.CREATE)).toBe(true);
      expect(isInterfacePermissionEnabled(true, Permissions.CREATE)).toBe(true);
      expect(isInterfacePermissionEnabled({ use: true, create: true }, Permissions.CREATE)).toBe(
        true,
      );
      expect(isInterfacePermissionEnabled({ use: true }, Permissions.CREATE)).toBe(true);
    });
  });

  describe('isInterfacePermissionUseEnabled', () => {
    it('treats explicit false as disabled', () => {
      expect(isInterfacePermissionUseEnabled(false)).toBe(false);
      expect(isInterfacePermissionUseEnabled({ use: false })).toBe(false);
    });

    it('treats absent or enabled config as allowed at interface layer', () => {
      expect(isInterfacePermissionUseEnabled(undefined)).toBe(true);
      expect(isInterfacePermissionUseEnabled(true)).toBe(true);
      expect(isInterfacePermissionUseEnabled({ use: true })).toBe(true);
      expect(isInterfacePermissionUseEnabled({ create: false })).toBe(true);
    });
  });
});

describe('resolveScopeOverridePermission', () => {
  it('allows create when config says true even if role denies', () => {
    expect(
      resolveScopeOverridePermission(false, PermissionTypes.PROMPTS, Permissions.CREATE, {
        prompts: { use: true, create: true },
      }),
    ).toBe(true);
  });

  it('blocks create when config says false even if role allows', () => {
    expect(
      resolveScopeOverridePermission(true, PermissionTypes.PROMPTS, Permissions.CREATE, {
        prompts: { use: true, create: false },
      }),
    ).toBe(false);
  });

  it('defers to role when config bit is absent', () => {
    expect(
      resolveScopeOverridePermission(true, PermissionTypes.PROMPTS, Permissions.CREATE, {
        prompts: { use: true },
      }),
    ).toBe(true);
    expect(
      resolveScopeOverridePermission(false, PermissionTypes.PROMPTS, Permissions.CREATE, {
        prompts: { use: true },
      }),
    ).toBe(false);
  });

  it('ignores non scope-override permission types', () => {
    expect(
      resolveScopeOverridePermission(false, PermissionTypes.AGENTS, Permissions.CREATE, {
        prompts: { use: true, create: true },
      }),
    ).toBe(false);
  });
});
