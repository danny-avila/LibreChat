import { seal, stateCookieHeader } from '../../_lib/session.js';
import { accountUrl, callbackUrl } from '../../_lib/account.js';

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function onRequest({ request, env }) {
  const clientId =
    typeof env.MEO_OAUTH_CLIENT_ID === 'string' ? env.MEO_OAUTH_CLIENT_ID.trim() : '';
  if (!clientId) {
    return Response.json(
      { error: 'oauth_client_not_configured' },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
  const requestedReturn = new URL(request.url).searchParams.get('return') ?? '/new';
  const returnTo =
    requestedReturn.startsWith('/new') && !requestedReturn.startsWith('//')
      ? requestedReturn
      : '/new';
  const state = crypto.randomUUID();
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64url(verifierBytes);
  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  );
  const sealed = await seal({ state, verifier, returnTo, createdAt: Date.now() }, env);
  const authorize = new URL(`${accountUrl(env)}/v1/auth/oauth2/authorize`);
  authorize.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(request),
    response_type: 'code',
    scope: 'openid email profile offline_access meo:read meo:write',
    resource: 'https://api.meoarch.org',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Cache-Control': 'no-store',
      'Set-Cookie': stateCookieHeader(sealed),
    },
  });
}
