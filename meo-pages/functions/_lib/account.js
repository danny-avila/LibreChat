export function accountUrl(env) {
  const url = new URL(env.MEO_ACCOUNT_URL ?? 'https://account.meoarch.org');
  if (url.protocol !== 'https:' || url.hostname !== 'account.meoarch.org') {
    throw new Error('Meo Account origin is not configured');
  }
  return url.origin;
}

export function apiUrl(env) {
  const url = new URL(env.MEO_API_URL ?? 'https://api.meoarch.org');
  if (url.protocol !== 'https:' || url.hostname !== 'api.meoarch.org') {
    throw new Error('Meo API origin is not configured');
  }
  return url.origin;
}

export function callbackUrl(request) {
  return `${new URL(request.url).origin}/oauth/openid/callback`;
}

export function brokerUrl(env) {
  return `${apiUrl(env)}/v1/ai/provider-broker`;
}

export function authHeaders(env, token, extra = {}) {
  const headers = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export class OAuthTokenExchangeError extends Error {
  constructor(reason) {
    super('Meo Account token exchange failed');
    this.name = 'OAuthTokenExchangeError';
    this.reason = reason;
  }
}

function safeOAuthErrorCode(value) {
  if (typeof value !== 'string') return null;
  return /^[a-z0-9_]{1,64}$/.test(value) ? value : null;
}

async function tokenRequest(env, body) {
  let response;
  try {
    response = await fetch(`${accountUrl(env)}/v1/auth/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body),
    });
  } catch {
    throw new OAuthTokenExchangeError('token_network_error');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const oauthCode = safeOAuthErrorCode(payload?.error);
    throw new OAuthTokenExchangeError(
      oauthCode ? `token_${response.status}_${oauthCode}` : `token_http_${response.status}`,
    );
  }
  return payload;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function accountUser(env, accessToken) {
  // UserInfo is the identity endpoint for the OAuth/OIDC flow. Keep API resource
  // tokens for meo-api calls, but use the provider's UserInfo response to bind
  // the browser session to the Meo Account subject.
  const response = await fetch(`${accountUrl(env)}/v1/auth/oauth2/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Cache-Control': 'no-store',
    },
  });
  if (!response.ok) return null;

  const payload = await response.json().catch(() => null);
  const user = payload?.user ?? payload?.account ?? payload;
  if (!user || typeof user !== 'object') return null;

  const id =
    [user.sub, user.id, user.user_id].find(
      (candidate) => typeof candidate === 'string' && candidate,
    ) ?? '';
  if (!uuidPattern.test(id)) return null;

  return { ...user, id };
}

export async function exchangeCode(env, code, verifier, redirectUri) {
  return tokenRequest(env, {
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    client_id: env.MEO_OAUTH_CLIENT_ID,
    resource: 'https://api.meoarch.org',
  });
}

export async function refreshTokens(env, refreshToken) {
  try {
    return await tokenRequest(env, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.MEO_OAUTH_CLIENT_ID,
      resource: 'https://api.meoarch.org',
    });
  } catch {
    return null;
  }
}

export async function loadSession(request, env) {
  const { cookieValue, sessionCookieName, stateCookieName, seal, unseal, sessionCookieHeader } =
    await import('./session.js');

  // The durable session has its own cookie. During rollout, accept the old
  // OAuth-handoff cookie only as a fallback and migrate it immediately. Never
  // prefer the state cookie: while an OAuth flow is in progress it contains
  // PKCE state rather than a browser session.
  const primaryCookie = cookieValue(request, sessionCookieName);
  const legacyCookie = primaryCookie ? '' : cookieValue(request, stateCookieName);
  const rawCookie = primaryCookie || legacyCookie;
  if (!rawCookie) return { session: null, cookie: null, reason: 'cookie_missing' };

  const existing = await unseal(rawCookie, env);
  if (!existing) return { session: null, cookie: null, reason: 'cookie_unseal_failed' };
  if (typeof existing.accessToken !== 'string') {
    return { session: null, cookie: null, reason: 'access_token_missing' };
  }
  if (typeof existing.refreshToken !== 'string') {
    return { session: null, cookie: null, reason: 'refresh_token_missing' };
  }

  const expiresAt = Number(existing.expiresAt ?? 0);
  if (expiresAt > Math.floor(Date.now() / 1000) + 60) {
    const cookie = legacyCookie ? sessionCookieHeader(await seal(existing, env)) : null;
    return {
      session: existing,
      cookie,
      reason: legacyCookie ? 'migrated_legacy_cookie' : 'ok',
    };
  }

  const refreshed = await refreshTokens(env, existing.refreshToken);
  if (!refreshed?.access_token || !refreshed?.refresh_token) {
    return { session: null, cookie: null, reason: 'refresh_failed' };
  }
  const session = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAt:
      Number(refreshed.expires_at) ||
      Math.floor(Date.now() / 1000) + Number(refreshed.expires_in ?? 3600),
    userId: existing.userId,
  };
  const cookie = sessionCookieHeader(await seal(session, env));
  return { session, cookie, reason: 'refreshed' };
}
