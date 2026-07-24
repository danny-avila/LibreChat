import { createOpenAIIdentifier } from './identity';

describe('createOpenAIIdentifier', () => {
  const originalCredsKey = process.env.CREDS_KEY;

  beforeEach(() => {
    process.env.CREDS_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  afterAll(() => {
    if (originalCredsKey == null) {
      delete process.env.CREDS_KEY;
    } else {
      process.env.CREDS_KEY = originalCredsKey;
    }
  });

  it('is deterministic and domain-separated', () => {
    const values = ['tenant-1', 'user-1', 'openAI', 'gpt-5.6'];
    const first = createOpenAIIdentifier('cache', values);
    const second = createOpenAIIdentifier('cache', values);
    const safety = createOpenAIIdentifier('safety', values);

    expect(first).toBe(second);
    expect(first).not.toBe(safety);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes across identities without exposing raw identifiers', () => {
    const first = createOpenAIIdentifier('cache', ['tenant-1', 'user-1']);
    const second = createOpenAIIdentifier('cache', ['tenant-1', 'user-2']);

    expect(first).not.toBe(second);
    expect(first).not.toContain('tenant-1');
    expect(first).not.toContain('user-1');
  });

  it('requires CREDS_KEY', () => {
    delete process.env.CREDS_KEY;
    expect(() => createOpenAIIdentifier('safety', ['user-1'])).toThrow('CREDS_KEY');
  });
});
