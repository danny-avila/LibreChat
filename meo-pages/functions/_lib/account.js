export function accountUrl(env) {
  const url = new URL(env.SUPABASE_URL ?? '');
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) {
    throw new Error('Supabase origin is not configured');
  }
  return url.origin;
}

export function callbackUrl(request) {
  return `${new URL(request.url).origin}/oauth/openid/callback`;
}

export function brokerUrl(env) {
  return `${accountUrl(env)}/functions/v1/ai-provider-broker`;
}

export function authHeaders(env, token, extra = {}) {
  const headers = {
    apikey: env.SUPABASE_ANON_KEY,
    ...extra,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function accountUser(env, accessToken) {
  const response = await fetch(`${accountUrl(env)}/auth/v1/user`, {
    headers: authHeaders(env, accessToken),
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user && typeof user.id === 'string' ? user : null;
}

export async function exchangeCode(env, code, verifier, redirectUri) {
  const response = await fetch(`${accountUrl(env)}/auth/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      client_id: env.MEO_OAUTH_CLIENT_ID,
    }),
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Meo Account sign-in could not be completed');
  return response.json();
}

export async function refreshTokens(env, refreshToken) {
  const response = await fetch(`${accountUrl(env)}/auth/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.MEO_OAUTH_CLIENT_ID,
    }),
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) return null;
  return response.json();
}

export async function loadSession(request, env) {
  const { cookieValue, sessionCookieName, seal, unseal, sessionCookieHeader } = await import(
    './session.js'
  );
  const existing = await unseal(cookieValue(request, sessionCookieName), env);
  if (
    !existing ||
    typeof existing.accessToken !== 'string' ||
    typeof existing.refreshToken !== 'string'
  ) {
    return { session: null, cookie: null };
  }
  const expiresAt = Number(existing.expiresAt ?? 0);
  if (expiresAt > Math.floor(Date.now() / 1000) + 60) return { session: existing, cookie: null };
  const refreshed = await refreshTokens(env, existing.refreshToken);
  if (!refreshed?.access_token || !refreshed?.refresh_token) return { session: null, cookie: null };
  const session = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAt:
      Number(refreshed.expires_at) ||
      Math.floor(Date.now() / 1000) + Number(refreshed.expires_in ?? 3600),
    userId: existing.userId,
  };
  const cookie = sessionCookieHeader(await seal(session, env));
  return { session, cookie };
}
