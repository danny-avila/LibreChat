import {
  SystemCapabilities,
  expandImplications,
  hasImpliedCapability,
  CAPABILITY_CATEGORIES,
  CapabilityImplications,
} from 'librechat-data-provider';

describe('CapabilityImplications', () => {
  it('maps every manage:* to an array containing its corresponding read:*', () => {
    expect(CapabilityImplications[SystemCapabilities.MANAGE_USERS]).toContain(
      SystemCapabilities.READ_USERS,
    );
    expect(CapabilityImplications[SystemCapabilities.MANAGE_GROUPS]).toContain(
      SystemCapabilities.READ_GROUPS,
    );
    expect(CapabilityImplications[SystemCapabilities.MANAGE_ROLES]).toContain(
      SystemCapabilities.READ_ROLES,
    );
    expect(CapabilityImplications[SystemCapabilities.MANAGE_CONFIGS]).toContain(
      SystemCapabilities.READ_CONFIGS,
    );
    expect(CapabilityImplications[SystemCapabilities.MANAGE_AGENTS]).toContain(
      SystemCapabilities.READ_AGENTS,
    );
    expect(CapabilityImplications[SystemCapabilities.MANAGE_PROMPTS]).toContain(
      SystemCapabilities.READ_PROMPTS,
    );
    expect(CapabilityImplications[SystemCapabilities.MANAGE_ASSISTANTS]).toContain(
      SystemCapabilities.READ_ASSISTANTS,
    );
  });

  it('does not include non-manage capabilities', () => {
    expect(CapabilityImplications[SystemCapabilities.ACCESS_ADMIN]).toBeUndefined();
    expect(CapabilityImplications[SystemCapabilities.READ_USAGE]).toBeUndefined();
    expect(CapabilityImplications[SystemCapabilities.ASSIGN_CONFIGS]).toBeUndefined();
  });
});

describe('hasImpliedCapability', () => {
  it('returns true for direct match', () => {
    expect(
      hasImpliedCapability([SystemCapabilities.READ_USERS], SystemCapabilities.READ_USERS),
    ).toBe(true);
  });

  it('returns true when manage:* implies read:*', () => {
    expect(
      hasImpliedCapability([SystemCapabilities.MANAGE_USERS], SystemCapabilities.READ_USERS),
    ).toBe(true);
  });

  it('returns false when capability is not held and not implied', () => {
    expect(
      hasImpliedCapability([SystemCapabilities.READ_CONFIGS], SystemCapabilities.READ_USERS),
    ).toBe(false);
  });

  it('returns false for empty held list', () => {
    expect(hasImpliedCapability([], SystemCapabilities.ACCESS_ADMIN)).toBe(false);
  });

  it('works with multiple held capabilities', () => {
    const held = [SystemCapabilities.MANAGE_USERS, SystemCapabilities.READ_CONFIGS];
    expect(hasImpliedCapability(held, SystemCapabilities.READ_USERS)).toBe(true);
    expect(hasImpliedCapability(held, SystemCapabilities.READ_CONFIGS)).toBe(true);
    expect(hasImpliedCapability(held, SystemCapabilities.READ_GROUPS)).toBe(false);
  });
});

describe('expandImplications', () => {
  it('expands manage:users to include read:users', () => {
    const result = expandImplications([SystemCapabilities.MANAGE_USERS]);
    expect(result).toContain(SystemCapabilities.MANAGE_USERS);
    expect(result).toContain(SystemCapabilities.READ_USERS);
  });

  it('does not duplicate already-held read capabilities', () => {
    const result = expandImplications([
      SystemCapabilities.MANAGE_USERS,
      SystemCapabilities.READ_USERS,
    ]);
    const readCount = result.filter((c) => c === SystemCapabilities.READ_USERS).length;
    expect(readCount).toBe(1);
  });

  it('does not expand non-manage capabilities', () => {
    const result = expandImplications([SystemCapabilities.ACCESS_ADMIN]);
    expect(result).toEqual([SystemCapabilities.ACCESS_ADMIN]);
  });
});

describe('CAPABILITY_CATEGORIES', () => {
  it('covers every base SystemCapabilities value exactly once', () => {
    const allCaps = Object.values(SystemCapabilities);
    const categorized = CAPABILITY_CATEGORIES.flatMap((c) => c.capabilities);

    for (const cap of allCaps) {
      const count = categorized.filter((c) => c === cap).length;
      expect({ cap, count }).toEqual({ cap, count: 1 });
    }
    expect(categorized.length).toBe(allCaps.length);
  });

  it('has unique category keys', () => {
    const keys = CAPABILITY_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
