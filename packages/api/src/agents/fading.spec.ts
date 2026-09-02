import { isAgentFadingTier, resolvePersistableFadingTier, resolveRunContextMeta } from './fading';

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

describe('resolveRunContextMeta', () => {
  const fading = { v: 1, budgetTokens: 20_000, masked: true };
  const getEncoding = jest.fn(() => 'claude');

  beforeEach(() => getEncoding.mockClear());

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
