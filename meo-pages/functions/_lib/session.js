const sessionCookie = '__Host-meo-session';
const stateCookie = '__Host-meo-oauth';
const legacyStateCookie = '__Secure-meo-oauth';
const textEncoder = new TextEncoder();

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64url(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function key(env) {
  const raw = fromBase64url(env.SESSION_SECRET ?? '');
  if (raw.byteLength !== 32) throw new Error('Session encryption is not configured');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(value, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await key(env),
    textEncoder.encode(JSON.stringify(value)),
  );
  return `${base64url(iv)}.${base64url(new Uint8Array(ciphertext))}`;
}

export async function unseal(value, env) {
  if (!value || value.length > 3800) return null;
  try {
    const [iv, ciphertext, extra] = value.split('.');
    if (!iv || !ciphertext || extra) return null;
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64url(iv) },
      await key(env),
      fromBase64url(ciphertext),
    );
    const decoded = JSON.parse(new TextDecoder().decode(plaintext));
    return decoded && typeof decoded === 'object' ? decoded : null;
  } catch {
    return null;
  }
}

export function cookieValue(request, name) {
  const header = request.headers.get('Cookie') ?? '';
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator >= 0 && item.slice(0, separator).trim() === name) {
      return item.slice(separator + 1).trim();
    }
  }
  return '';
}

export function stateCookieValue(request) {
  return cookieValue(request, stateCookie) || cookieValue(request, legacyStateCookie);
}

export function sessionCookieHeader(value, maxAge = 60 * 60 * 24 * 30) {
  // Session and OAuth state must use different cookie names. The callback clears
  // the short-lived state cookie after a successful exchange; reusing that name
  // here would clear the newly-created session in the same response and cause a
  // permanent sign-in loop.
  return `${sessionCookie}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function stateCookieHeader(value, maxAge = 600) {
  // Host-only + Path=/ avoids callback-path mismatches across Pages routing and
  // still keeps the short-lived PKCE flow cookie inaccessible to JavaScript.
  return `${stateCookie}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export const sessionCookieName = sessionCookie;
export const stateCookieName = stateCookie;

export function clearCookies() {
  return [
    `${sessionCookie}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    `${stateCookie}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    `${legacyStateCookie}=; Path=/oauth/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  ];
}
