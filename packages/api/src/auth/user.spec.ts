import { sanitizeUserForAuthResponse } from './user';

describe('sanitizeUserForAuthResponse', () => {
  it.each(['lean', 'hydrated'] as const)(
    'returns a canonical identity and preserved public fields from a %s user without mutation',
    (kind) => {
      const storedId = { toString: () => 'user-id' };
      const source = Object.freeze({
        _id: storedId,
        id: 'stale-id',
        tenantId: 'tenant-id',
        email: 'user@example.com',
        role: 'USER',
        termsAccepted: true,
        personalization: { memories: false },
        favorites: [{ id: 'favorite' }],
        password: 'hashed-password',
        __v: 1,
        totpSecret: 'totp-secret',
        backupCodes: ['backup-code'],
        federatedTokens: { access_token: 'private-token' },
      });
      const user = kind === 'hydrated' ? { ...source, toObject: () => source } : source;

      expect(sanitizeUserForAuthResponse(user)).toEqual({
        _id: storedId,
        id: 'user-id',
        tenantId: 'tenant-id',
        email: 'user@example.com',
        role: 'USER',
        termsAccepted: true,
        personalization: { memories: false },
        favorites: [{ id: 'favorite' }],
      });
      expect(source.id).toBe('stale-id');
      expect(source.password).toBe('hashed-password');
      expect(source.federatedTokens.access_token).toBe('private-token');
    },
  );

  it('preserves an existing canonical id when no stored id is supplied', () => {
    expect(sanitizeUserForAuthResponse({ id: 'user-id', tenantId: 'tenant-id' })).toEqual({
      id: 'user-id',
      tenantId: 'tenant-id',
    });
  });
});
