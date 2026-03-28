import { tenantStorage, runAsSystem, scopedCacheKey } from './tenantContext';

describe('scopedCacheKey', () => {
  it('returns base key when no ALS context is set', () => {
    expect(scopedCacheKey('MODELS_CONFIG')).toBe('MODELS_CONFIG');
  });

  it('returns base key in SYSTEM_TENANT_ID context', async () => {
    await runAsSystem(async () => {
      expect(scopedCacheKey('MODELS_CONFIG')).toBe('MODELS_CONFIG');
    });
  });

  it('appends tenantId when tenant context is active', async () => {
    await tenantStorage.run({ tenantId: 'acme' }, async () => {
      expect(scopedCacheKey('MODELS_CONFIG')).toBe('MODELS_CONFIG:acme');
    });
  });

  it('does not leak tenant context outside ALS scope', async () => {
    await tenantStorage.run({ tenantId: 'acme' }, async () => {
      expect(scopedCacheKey('KEY')).toBe('KEY:acme');
    });
    expect(scopedCacheKey('KEY')).toBe('KEY');
  });
});
