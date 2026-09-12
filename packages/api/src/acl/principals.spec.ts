import { resolveDirectoryPrincipalUser } from './principals';

describe('resolveDirectoryPrincipalUser', () => {
  it('returns a user already linked to the directory source ID', () => {
    expect(
      resolveDirectoryPrincipalUser({
        userBySourceId: { id: 'source-user' },
        userByEmail: { id: 'email-user' },
      }),
    ).toBe('source-user');
  });

  it('rejects linking an existing user found only by email', () => {
    expect(() => resolveDirectoryPrincipalUser({ userByEmail: { id: 'email-user' } })).toThrow(
      'Existing user must link their directory identity during sign-in',
    );
  });

  it('allows creation when neither identifier matches an existing user', () => {
    expect(resolveDirectoryPrincipalUser({})).toBeNull();
  });
});
