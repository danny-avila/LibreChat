import { setTokenHeader } from 'librechat-data-provider';
import { getSessionUserId } from '../session';

/** Shaped like the real access token, whose payload carries an `id` claim. */
const tokenFor = (userId: string, issuedAt = 1) => {
  const claims = btoa(JSON.stringify({ id: userId, iat: issuedAt })).replace(/=+$/, '');
  return `header.${claims}.signature`;
};

describe('getSessionUserId', () => {
  afterEach(() => {
    setTokenHeader(undefined);
  });

  it('reads the account from the installed credentials', () => {
    setTokenHeader(tokenFor('user-a'));
    expect(getSessionUserId()).toBe('user-a');
  });

  /* `setUserContext` installs the header in one synchronous call while React
   * state catches up later, so this has to change with the header, not after. */
  it('changes in the same turn as the header', () => {
    setTokenHeader(tokenFor('user-a'));
    setTokenHeader(tokenFor('user-b'));
    expect(getSessionUserId()).toBe('user-b');
  });

  it('reports no account once signed out', () => {
    setTokenHeader(tokenFor('user-a'));
    setTokenHeader(undefined);
    expect(getSessionUserId()).toBeUndefined();
  });

  /* A silent refresh rotates the token for the same account. Comparing tokens
   * would read that as a different session and throw away queued work the user
   * is still entitled to, so the claim is what matters. */
  it('sees a refreshed token as the same account', () => {
    setTokenHeader(tokenFor('user-a', 1));
    const before = getSessionUserId();
    setTokenHeader(tokenFor('user-a', 2));

    expect(getSessionUserId()).toBe(before);
    expect(getSessionUserId()).toBe('user-a');
  });

  it('attributes an unreadable token to no one', () => {
    setTokenHeader('not-a-jwt');
    expect(getSessionUserId()).toBeUndefined();

    setTokenHeader('header.$$$notbase64$$$.signature');
    expect(getSessionUserId()).toBeUndefined();
  });

  it('attributes a token without an id claim to no one', () => {
    const claims = btoa(JSON.stringify({ email: 'a@example.com' })).replace(/=+$/, '');
    setTokenHeader(`header.${claims}.signature`);
    expect(getSessionUserId()).toBeUndefined();
  });

  it('decodes a payload whose length needs base64 padding restored', () => {
    /* Ids vary in length, so the dropped `=` padding has to be put back. */
    for (const id of ['a', 'ab', 'abc', 'abcd', '6a89f66dd0b2baf4d4b02917']) {
      setTokenHeader(tokenFor(id));
      expect(getSessionUserId()).toBe(id);
    }
  });
});
