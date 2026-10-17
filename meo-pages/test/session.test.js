import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seal,
  unseal,
  cookieValue,
  stateCookieValue,
  sessionCookieHeader,
  stateCookieHeader,
} from '../functions/_lib/session.js';

const env = { SESSION_SECRET: 'A'.repeat(43) };

test('session payload is authenticated encryption and cookies stay separated', async () => {
  const sealed = await seal({ accessToken: 'secret-token', userId: 'user-1' }, env);
  assert.deepEqual(await unseal(sealed, env), { accessToken: 'secret-token', userId: 'user-1' });
  const [iv, ciphertext] = sealed.split('.');
  const alteredCiphertext = `${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`;
  assert.equal(await unseal(`${iv}.${alteredCiphertext}`, env), null);

  const sessionHeader = sessionCookieHeader(sealed);
  const stateHeader = stateCookieHeader(sealed);
  assert.match(sessionHeader, /^__Host-meo-session=/);
  assert.match(sessionHeader, /Path=\/;/);
  assert.match(sessionHeader, /HttpOnly; Secure; SameSite=Lax/);
  assert.doesNotMatch(sessionHeader, /^__Host-meo-oauth=/);
  assert.match(stateHeader, /^__Host-meo-oauth=.*Path=\/;.*HttpOnly; Secure;.*SameSite=Lax/);

  assert.equal(
    cookieValue(
      new Request('https://chat.meoarch.org', {
        headers: { Cookie: `other=x; __Host-meo-session=${sealed}` },
      }),
      '__Host-meo-session',
    ),
    sealed,
  );
  assert.equal(
    stateCookieValue(
      new Request('https://chat.meoarch.org/oauth/openid/callback', {
        headers: { Cookie: `__Host-meo-oauth=${sealed}` },
      }),
    ),
    sealed,
  );
  assert.equal(
    stateCookieValue(
      new Request('https://chat.meoarch.org/oauth/openid/callback', {
        headers: { Cookie: `__Secure-meo-oauth=${sealed}` },
      }),
    ),
    sealed,
  );
});
