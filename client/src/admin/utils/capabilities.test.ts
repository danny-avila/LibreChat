import { SystemCapabilities } from 'librechat-data-provider';
import { hasConfigCapability, getTabsWithPermission, isSectionDisabled } from './capabilities';

describe('hasConfigCapability', () => {
  const makeChecker =
    (held: string[]) =>
    (cap: string): boolean =>
      held.includes(cap);

  describe('manage verb', () => {
    it('returns true when broad MANAGE_CONFIGS is held', () => {
      const has = makeChecker([SystemCapabilities.MANAGE_CONFIGS]);
      expect(hasConfigCapability(has, 'mcp', 'manage')).toBe(true);
      expect(hasConfigCapability(has, 'endpoints', 'manage')).toBe(true);
      expect(hasConfigCapability(has, null, 'manage')).toBe(true);
    });

    it('returns true for section-level manage capability', () => {
      const has = makeChecker(['manage:configs:mcp']);
      expect(hasConfigCapability(has, 'mcp', 'manage')).toBe(true);
    });

    it('returns false when section-level capability does not match', () => {
      const has = makeChecker(['manage:configs:mcp']);
      expect(hasConfigCapability(has, 'endpoints', 'manage')).toBe(false);
    });

    it('returns false with no capabilities and null section', () => {
      const has = makeChecker([]);
      expect(hasConfigCapability(has, null, 'manage')).toBe(false);
    });
  });

  describe('read verb', () => {
    it('returns true when broad READ_CONFIGS is held', () => {
      const has = makeChecker([SystemCapabilities.READ_CONFIGS]);
      expect(hasConfigCapability(has, 'mcp', 'read')).toBe(true);
      expect(hasConfigCapability(has, null, 'read')).toBe(true);
    });

    it('returns true for section-level read capability', () => {
      const has = makeChecker(['read:configs:mcp']);
      expect(hasConfigCapability(has, 'mcp', 'read')).toBe(true);
    });

    it('returns true when manage:configs:{section} is held (manage implies read)', () => {
      const has = makeChecker(['manage:configs:mcp']);
      expect(hasConfigCapability(has, 'mcp', 'read')).toBe(true);
    });

    it('returns false when manage:configs:{other} is held for different section', () => {
      const has = makeChecker(['manage:configs:mcp']);
      expect(hasConfigCapability(has, 'endpoints', 'read')).toBe(false);
    });

    it('returns false with no capabilities', () => {
      const has = makeChecker([]);
      expect(hasConfigCapability(has, 'mcp', 'read')).toBe(false);
    });
  });
});

describe('getTabsWithPermission', () => {
  const schemaTree = [
    {
      key: 'endpoints',
      path: 'endpoints',
      type: 'object',
      isOptional: false,
      isNullable: false,
      isArray: false,
      isObject: true,
      depth: 0,
    },
    {
      key: 'mcpServers',
      path: 'mcpServers',
      type: 'record',
      isOptional: false,
      isNullable: false,
      isArray: false,
      isObject: false,
      depth: 0,
    },
    {
      key: 'interface',
      path: 'interface',
      type: 'object',
      isOptional: false,
      isNullable: false,
      isArray: false,
      isObject: true,
      depth: 0,
    },
    {
      key: 'unknownSection',
      path: 'unknownSection',
      type: 'string',
      isOptional: false,
      isNullable: false,
      isArray: false,
      isObject: false,
      depth: 0,
    },
  ];

  const sectionMeta: Record<string, { tab: string; schemaKey?: string }> = {
    endpoints: { tab: 'custom' },
    endpointsProviders: { tab: 'providers', schemaKey: 'endpoints' },
    mcpServers: { tab: 'mcp' },
    interface: { tab: 'ai' },
  };

  it('returns tabs with viewable sections', () => {
    const perms = {
      endpoints: { canView: true, canEdit: false },
      mcpServers: { canView: false, canEdit: false },
      interface: { canView: true, canEdit: false },
      unknownSection: { canView: true, canEdit: false },
    };
    const result = getTabsWithPermission(schemaTree, sectionMeta, 'other', perms, 'canView');
    expect(result.has('custom')).toBe(true);
    expect(result.has('ai')).toBe(true);
    expect(result.has('other')).toBe(true);
    expect(result.has('mcp')).toBe(false);
  });

  it('includes virtual section tabs via schemaKey', () => {
    const perms = {
      endpoints: { canView: true, canEdit: false },
      mcpServers: { canView: false, canEdit: false },
      interface: { canView: false, canEdit: false },
      unknownSection: { canView: false, canEdit: false },
    };
    const result = getTabsWithPermission(schemaTree, sectionMeta, 'other', perms, 'canView');
    expect(result.has('custom')).toBe(true);
    expect(result.has('providers')).toBe(true);
  });

  it('returns editable tabs', () => {
    const perms = {
      endpoints: { canView: true, canEdit: false },
      mcpServers: { canView: true, canEdit: true },
      interface: { canView: true, canEdit: false },
      unknownSection: { canView: true, canEdit: false },
    };
    const result = getTabsWithPermission(schemaTree, sectionMeta, 'other', perms, 'canEdit');
    expect(result.has('mcp')).toBe(true);
    expect(result.has('custom')).toBe(false);
    expect(result.has('ai')).toBe(false);
  });

  it('returns empty set when no permissions match', () => {
    const perms = {
      endpoints: { canView: false, canEdit: false },
      mcpServers: { canView: false, canEdit: false },
      interface: { canView: false, canEdit: false },
      unknownSection: { canView: false, canEdit: false },
    };
    const result = getTabsWithPermission(schemaTree, sectionMeta, 'other', perms, 'canView');
    expect(result.size).toBe(0);
  });
});

describe('isSectionDisabled', () => {
  const perms = {
    interface: { canView: true, canEdit: true },
    speech: { canView: true, canEdit: false },
    endpoints: { canView: true, canEdit: true },
  };

  it('returns true when readOnly is true regardless of section permissions', () => {
    expect(isSectionDisabled(true, perms, 'interface')).toBe(true);
    expect(isSectionDisabled(true, perms, 'speech')).toBe(true);
  });

  it('returns false for editable sections when readOnly is false', () => {
    expect(isSectionDisabled(false, perms, 'interface')).toBe(false);
    expect(isSectionDisabled(false, perms, 'endpoints')).toBe(false);
  });

  it('returns true for non-editable sections when readOnly is false', () => {
    expect(isSectionDisabled(false, perms, 'speech')).toBe(true);
  });

  it('returns true for unknown sections not in permissions', () => {
    expect(isSectionDisabled(false, perms, 'unknownSection')).toBe(true);
  });

  it('returns false when sectionPerms is undefined (no section gating)', () => {
    expect(isSectionDisabled(false, undefined, 'anything')).toBe(false);
  });

  it('independently disables sections on the same tab', () => {
    expect(isSectionDisabled(false, perms, 'interface')).toBe(false);
    expect(isSectionDisabled(false, perms, 'speech')).toBe(true);
  });
});
