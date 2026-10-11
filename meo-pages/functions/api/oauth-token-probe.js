import { accountUrl } from '../_lib/account.js';

function safeOAuthErrorCode(value) {
  if (typeof value !== 'string') return null;
  return /^[a-z0-9_]{1,64}$/.test(value) ? value : null;
}

export async function onRequestGet({ env }) {
  try {
    const response = await fetch(`${accountUrl(env)}/auth/v1/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'meo-diagnostic-invalid-code',
        client_id: env.MEO_OAUTH_CLIENT_ID,
        redirect_uri: 'https://chat.meoarch.org/oauth/openid/callback',
        code_verifier: 'meo-diagnostic-invalid-verifier',
      }),
    });
    const payload = await response.json().catch(() => null);
    return Response.json(
      {
        reachable: true,
        status: response.status,
        oauth_error: safeOAuthErrorCode(payload?.error),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        reachable: false,
        error_name: error instanceof Error ? error.name : 'UnknownError',
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
