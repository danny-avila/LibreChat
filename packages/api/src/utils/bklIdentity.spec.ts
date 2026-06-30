import { bklIdentityHeaders, withBklIdentityHeaders } from './bklIdentity';
import type { BklUser } from './bklIdentity';

const fullUser: BklUser = {
  _id: 'lc-mongo-id',
  bkl_sid: 103455,
  bkl_user_id: 'JHSON',
  bkl_user_nm: '손정현',
  username: 'JHSON',
  name: '손정현',
  email: 'jhson@bkl.co.kr',
  role: 'USER',
};

describe('bklIdentityHeaders', () => {
  it('returns an empty object when there is no request', () => {
    expect(bklIdentityHeaders()).toEqual({});
    expect(bklIdentityHeaders(null)).toEqual({});
    expect(bklIdentityHeaders({})).toEqual({});
    expect(bklIdentityHeaders({ user: null })).toEqual({});
  });

  it('forwards the full BKL/BIMS identity from req.user', () => {
    const headers = bklIdentityHeaders({ user: fullUser });
    expect(headers).toEqual({
      'X-BKL-User-Sid': '103455',
      'X-BKL-User-Id': 'JHSON',
      'X-BKL-User-Nm': encodeURIComponent('손정현'),
      'X-LC-User-Id': 'lc-mongo-id',
      'X-LC-User-Email': 'jhson@bkl.co.kr',
      'X-LC-User-Role': 'USER',
    });
  });

  it('omits the sid header entirely when bkl_sid is missing (no impersonation)', () => {
    const headers = bklIdentityHeaders({
      user: { bkl_user_id: 'JHSON', username: 'JHSON', email: 'jhson@bkl.co.kr', role: 'USER' },
    });
    expect(headers['X-BKL-User-Sid']).toBeUndefined();
    expect(headers['X-BKL-User-Id']).toBe('JHSON');
  });

  it('falls back to username for the BKL user id when bkl_user_id is absent', () => {
    const headers = bklIdentityHeaders({ user: { bkl_sid: 1, username: 'legacy.user' } });
    expect(headers['X-BKL-User-Id']).toBe('legacy.user');
  });

  it('URL-encodes the display name so the ai-api can unquote it', () => {
    const headers = bklIdentityHeaders({ user: { bkl_sid: 1, bkl_user_nm: '손정현' } });
    expect(headers['X-BKL-User-Nm']).toBe('%EC%86%90%EC%A0%95%ED%98%84');
  });

  it('forwards ADMIN role so the ai-api can bypass the ACL', () => {
    const headers = bklIdentityHeaders({ user: { bkl_sid: 1, role: 'ADMIN' } });
    expect(headers['X-LC-User-Role']).toBe('ADMIN');
  });
});

describe('withBklIdentityHeaders', () => {
  it('returns headers unchanged when the endpoint did not opt in', () => {
    const headers = { 'X-Custom': 'value' };
    expect(withBklIdentityHeaders(headers, { user: fullUser })).toBe(headers);
  });

  it('returns headers unchanged when there is no authenticated user', () => {
    const headers = { 'X-LC-User-Role': '{{LIBRECHAT_USER_ROLE}}' };
    expect(withBklIdentityHeaders(headers, { user: null })).toBe(headers);
  });

  it('overrides placeholder identity headers with real values and adds the sid', () => {
    const headers = {
      'X-BKL-User-Id': '{{LIBRECHAT_USER_ID}}',
      'X-LC-User-Role': '{{LIBRECHAT_USER_ROLE}}',
      'X-BKL-Conversation-Id': '{{LIBRECHAT_BODY_CONVERSATIONID}}',
    };
    const result = withBklIdentityHeaders(headers, { user: fullUser });
    expect(result).toEqual({
      'X-BKL-User-Id': 'JHSON',
      'X-LC-User-Role': 'USER',
      'X-BKL-Conversation-Id': '{{LIBRECHAT_BODY_CONVERSATIONID}}',
      'X-BKL-User-Sid': '103455',
      'X-BKL-User-Nm': encodeURIComponent('손정현'),
      'X-LC-User-Id': 'lc-mongo-id',
      'X-LC-User-Email': 'jhson@bkl.co.kr',
    });
    expect(headers['X-BKL-User-Id']).toBe('{{LIBRECHAT_USER_ID}}');
  });

  it('passes through undefined headers', () => {
    expect(withBklIdentityHeaders(undefined, { user: fullUser })).toBeUndefined();
  });
});
