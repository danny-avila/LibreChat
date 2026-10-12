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
    // Keep this request intentionally identical to Supabase's documented
    // public-client OAuth 2.1 example. Extra RequestInit options can change
    // edge-runtime behaviour and are unnecessary for this POST.
    response = await fetch(`${accountUrl(env)}/auth/v1/oauth/token`, {
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

export async function accountUser(env, accessToken) {
  // OAuth access tokens issued by Supabase's OAuth 2.1 server use the OIDC
  // UserInfo endpoint. /auth/v1/user is for a normal Supabase Auth session
  // and is not the correct post-exchange identity lookup for this client.
  const response = await fetch(`${accountUrl(env)}/auth/v1/oauth/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  if (!user || typeof user.sub !== 'string' || !user.sub) return null;
  // Keep the internal session shape stable for existing callers while using
  // the standards-compliant OIDC subject as the account identity.
  return { ...user, id: user.sub };
}

export async function exchangeCode(env, code, verifier, redirectUri) {
  return tokenRequest(env, {
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    client_id: env.MEO_OAUTH_CLIENT_ID,
  });
}

export async function refreshTokens(env, refreshToken) {
  try {
    return await tokenRequest(env, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.MEO_OAUTH_CLIENT_ID,
    });
  } catch {
    return null;
  }
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
