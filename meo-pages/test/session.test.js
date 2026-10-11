import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seal,
  unseal,
  cookieValue,
  sessionCookieHeader,
  stateCookieHeader,
} from '../functions/_lib/session.js';

const env = { SESSION_SECRET: 'A'.repeat(43) };

test('session payload is authenticated encryption and cookie is HttpOnly', async () => {
  const sealed = await seal({ accessToken: 'secret-token', userId: 'user-1' }, env);
  assert.deepEqual(await unseal(sealed, env), { accessToken: 'secret-token', userId: 'user-1' });
  const [iv, ciphertext] = sealed.split('.');
  const alteredCiphertext = `${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`;
  assert.equal(await unseal(`${iv}.${alteredCiphertext}`, env), null);
  assert.match(sessionCookieHeader(sealed), /HttpOnly; Secure; SameSite=Lax/);
  assert.match(
    stateCookieHeader(sealed),
    /^__Secure-meo-oauth=.*Path=\/oauth\/;.*HttpOnly; Secure;/,
  );
  assert.equal(
    cookieValue(
      new Request('https://chat.meoarch.org', {
        headers: { Cookie: `other=x; __Host-meo-session=${sealed}` },
      }),
      '__Host-meo-session',
    ),
    sealed,
  );
});
