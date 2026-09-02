import {
  isAgentFadingTier,
  resolvePersistableFadingTier,
  resolvePersistableFadingTiers,
  resolveRunContextMeta,
  resolveRunFadingTiers,
} from './fading';

describe('isAgentFadingTier', () => {
  it('accepts a well-formed tier and rejects everything else', () => {
    expect(isAgentFadingTier({ v: 1, budgetTokens: 20_000, masked: true })).toBe(true);
    expect(isAgentFadingTier({ v: 2, budgetTokens: 20_000, masked: true })).toBe(false);
    expect(isAgentFadingTier({ v: 1, budgetTokens: 0, masked: true })).toBe(false);
    expect(isAgentFadingTier({ v: 1, budgetTokens: 20_000, masked: 'yes' })).toBe(false);
    expect(isAgentFadingTier({ v: 1, budgetTokens: Number.NaN, masked: false })).toBe(false);
    expect(isAgentFadingTier(null)).toBe(false);
    expect(isAgentFadingTier(undefined)).toBe(false);
  });
});

describe('resolvePersistableFadingTier', () => {
  it('strips a valid tier to its fields and drops invalid input', () => {
    expect(
      resolvePersistableFadingTier({ v: 1, budgetTokens: 50_000, masked: true, extra: 1 }),
    ).toEqual({ v: 1, budgetTokens: 50_000, masked: true });
    expect(resolvePersistableFadingTier(undefined)).toBeUndefined();
    expect(resolvePersistableFadingTier({ v: 1, budgetTokens: -1, masked: true })).toBeUndefined();
  });
});

describe('resolvePersistableFadingTiers', () => {
  it('keeps only valid tiers, stripped to the compact shape, from own keys', () => {
    const snapshot = Object.fromEntries([
      ['agent-a', { v: 1, budgetTokens: 20_000, masked: true, latched: true }],
      ['agent-b', { v: 1, budgetTokens: 0, masked: false }],
      ['__proto__', { v: 1, budgetTokens: 10_000, masked: false, latched: true }],
    ]);
    expect(resolvePersistableFadingTiers(snapshot)).toEqual([
      { agentId: 'agent-a', v: 1, budgetTokens: 20_000, masked: true },
      { agentId: '__proto__', v: 1, budgetTokens: 10_000, masked: false },
    ]);
  });

  it('ignores inherited keys and yields nothing for an empty or invalid snapshot', () => {
    const inherited = Object.create({ ghost: { v: 1, budgetTokens: 20_000, masked: true } });
    expect(resolvePersistableFadingTiers(inherited)).toBeUndefined();
    expect(resolvePersistableFadingTiers({})).toBeUndefined();
    expect(resolvePersistableFadingTiers(null)).toBeUndefined();
    expect(resolvePersistableFadingTiers('agent-a')).toBeUndefined();
  });
});

describe('resolveRunFadingTiers', () => {
  it('rebuilds a prototype-safe record from persisted entries', () => {
    const tiers = resolveRunFadingTiers([
      { agentId: 'agent-a', v: 1, budgetTokens: 20_000, masked: true },
      { agentId: '__proto__', v: 1, budgetTokens: 10_000, masked: false },
    ]);

    expect(tiers).toBeDefined();
    expect(Object.getPrototypeOf(tiers)).toBeNull();
    expect(Object.keys(tiers ?? {})).toEqual(['agent-a', '__proto__']);
    expect(Object.prototype.hasOwnProperty.call(tiers, '__proto__')).toBe(true);
    expect(tiers?.['agent-a']).toEqual({ v: 1, budgetTokens: 20_000, masked: true });
    expect('budgetTokens' in {}).toBe(false);
  });

  it('rejects duplicate, malformed, or empty entry lists', () => {
    expect(
      resolveRunFadingTiers([
        { agentId: 'agent-a', v: 1, budgetTokens: 20_000, masked: true },
        { agentId: 'agent-a', v: 1, budgetTokens: 10_000, masked: true },
      ]),
    ).toBeUndefined();
    expect(
      resolveRunFadingTiers([{ agentId: '', v: 1, budgetTokens: 1, masked: true }]),
    ).toBeUndefined();
    expect(resolveRunFadingTiers([])).toBeUndefined();
    expect(resolveRunFadingTiers(undefined)).toBeUndefined();
  });

  it('round-trips a run snapshot through the persisted entries unchanged', () => {
    const snapshot = {
      'agent-a': { v: 1 as const, budgetTokens: 20_000, masked: true, latched: true as const },
      'agent-b': { v: 1 as const, budgetTokens: 5_000, masked: false, latched: true as const },
    };
    const entries = resolvePersistableFadingTiers(snapshot);
    const restored = resolveRunFadingTiers(entries);
    expect(restored).toEqual({
      'agent-a': { v: 1, budgetTokens: 20_000, masked: true },
      'agent-b': { v: 1, budgetTokens: 5_000, masked: false },
    });
  });
});

describe('resolveRunContextMeta', () => {
  const fading = { v: 1, budgetTokens: 20_000, masked: true };
  const getEncoding = jest.fn(() => 'claude');

  beforeEach(() => getEncoding.mockClear());

  it('persists only compact tier and calibration metadata', () => {
    const meta = resolveRunContextMeta({
      calibrationRatio: 1.25,
      fadingTier: { ...fading, latched: true, messages: ['not persisted'] },
      fadingTiers: {
        'agent-a': { ...fading, latched: true, projection: { truncated: true } },
        'agent-b': { v: 1, budgetTokens: 5_000, masked: false, latched: true },
      },
      getEncoding,
    });

    expect(meta).toEqual({
      calibrationRatio: 1.25,
      encoding: 'claude',
      fading,
      fadingTiers: [
        { agentId: 'agent-a', v: 1, budgetTokens: 20_000, masked: true },
        { agentId: 'agent-b', v: 1, budgetTokens: 5_000, masked: false },
      ],
    });
    expect(Object.keys(meta ?? {})).toEqual([
      'calibrationRatio',
      'encoding',
      'fading',
      'fadingTiers',
    ]);
  });

  it('persists per-agent tiers alone when only a non-default agent latched one', () => {
    expect(
      resolveRunContextMeta({
        calibrationRatio: 1,
        fadingTier: undefined,
        fadingTiers: { 'agent-b': { v: 1, budgetTokens: 5_000, masked: true } },
        getEncoding,
      }),
    ).toEqual({
      calibrationRatio: 1,
      encoding: 'claude',
      fadingTiers: [{ agentId: 'agent-b', v: 1, budgetTokens: 5_000, masked: true }],
    });
  });

  it('persists a latched fading tier even at a neutral calibration ratio', () => {
    expect(resolveRunContextMeta({ calibrationRatio: 1, fadingTier: fading, getEncoding })).toEqual(
      { calibrationRatio: 1, encoding: 'claude', fading },
    );
  });

  it('persists calibration alone when the run exposes no tier', () => {
    expect(
      resolveRunContextMeta({ calibrationRatio: 1.2345, fadingTier: undefined, getEncoding }),
    ).toEqual({ calibrationRatio: 1.235, encoding: 'claude' });
  });

  it('persists nothing, without resolving the encoding, when there is nothing to keep', () => {
    expect(
      resolveRunContextMeta({ calibrationRatio: 0, fadingTier: { v: 1 }, getEncoding }),
    ).toBeUndefined();
    expect(getEncoding).not.toHaveBeenCalled();
  });
});
