import assistantSchema from './assistant';

describe('assistantSchema', () => {
  it('indexes tenant-scoped avatar filepath lookups', () => {
    expect(assistantSchema.indexes()).toContainEqual([
      { tenantId: 1, 'avatar.filepath': 1 },
      { background: true },
    ]);
  });
});
