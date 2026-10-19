import { apiUrl, brokerUrl, loadSession } from '../../_lib/account.js';
import { clearCookies } from '../../_lib/session.js';
import { legacyBrokerChatPayload } from '../../_lib/legacy-chat.js';

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function json(body, status = 200) {
  return Response.json(body, { status, headers: jsonHeaders });
}

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return ['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function targetFor(request, env, relativePath) {
  const method = request.method;
  if (relativePath === '/connections' && method === 'GET') {
    return {
      url: brokerUrl(env),
      method: 'POST',
      body: JSON.stringify({ action: 'list_credentials' }),
    };
  }

  const models = relativePath.match(/^\/connections\/([^/]+)\/models$/);
  if (models && method === 'GET') {
    return {
      url: brokerUrl(env),
      method: 'POST',
      body: JSON.stringify({
        action: 'list_models',
        credentialId: decodeURIComponent(models[1]),
      }),
    };
  }

  if (['/chat/prepare', '/chat/stream'].includes(relativePath) && method === 'POST') {
    return { url: `${apiUrl(env)}/v1${relativePath}`, method, body: null };
  }

  if (
    relativePath === '/conversations' ||
    /^\/conversations\/[^/]+\/messages$/.test(relativePath) ||
    // Reuse the existing account-scoped Project API rather than inventing
    // a separate Web-only store. The API owns project membership checks.
    ((relativePath === '/projects' ||
      /^\/projects\/[0-9a-f-]{36}(?:\/memories)?$/i.test(relativePath)) &&
      ['GET', 'POST', 'PATCH'].includes(method)) ||
    relativePath === '/settings' ||
    relativePath === '/memories' ||
    /^\/memories\/[0-9a-f-]{36}$/i.test(relativePath)
  ) {
    // Account-owned settings and memory use the AI API namespace.
    const upstreamPath = relativePath === '/settings' || relativePath.startsWith('/memories')
      ? `/v1/ai${relativePath}`
      : `/v1${relativePath}`;
    const target = new URL(`${apiUrl(env)}${upstreamPath}`);
    target.search = new URL(request.url).search;
    return { url: target.toString(), method, body: null };
  }

  return null;
}

function forwardedHeaders(request, accessToken, hasBody) {
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${accessToken}`);
  // Meo Account uses a secure cross-subdomain browser session. Preserve it
  // when the Pages BFF calls the first-party API so its session authenticator
  // can validate the same user before considering the OAuth bearer fallback.
  const cookie = request.headers.get('Cookie');
  if (cookie) headers.set('Cookie', cookie);
  headers.set('Cache-Control', 'no-store');
  const accept = request.headers.get('Accept');
  if (accept) headers.set('Accept', accept);
  const contentType = request.headers.get('Content-Type');
  if (contentType) headers.set('Content-Type', contentType);
  else if (hasBody) headers.set('Content-Type', 'application/json');
  return headers;
}

function downstreamHeaders(upstream) {
  const headers = new Headers({
    'Cache-Control': upstream.headers.get('Cache-Control') ?? 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  for (const name of ['Content-Type', 'X-Accel-Buffering']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export async function onRequest({ request, env }) {
  if (!sameOrigin(request)) return json({ error: { code: 'origin_not_allowed' } }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });

  const pathname = new URL(request.url).pathname;
  const relativePath = pathname.slice('/api/meo'.length) || '/';
  const route = targetFor(request, env, relativePath);
  if (!route) return json({ error: { code: 'not_found' } }, 404);

  const { session, cookie, reason } = await loadSession(request, env);
  if (!session) {
    if (reason === 'refresh_temporarily_unavailable') {
      // Fail closed but keep the existing encrypted session cookie so a later
      // request can retry refresh instead of forcing an unnecessary login.
      const response = json({ error: { code: 'session_temporarily_unavailable' } }, 503);
      response.headers.set('Retry-After', '2');
      return response;
    }
    const response = json({ error: { code: 'unauthenticated' } }, 401);
    for (const value of clearCookies()) response.headers.append('Set-Cookie', value);
    return response;
  }

  let body = route.body;
  if (body == null && !['GET', 'HEAD'].includes(route.method)) {
    body = await request.arrayBuffer();
  }
  const isChat = ['/chat/prepare', '/chat/stream'].includes(relativePath);
  const originalChatBody = isChat && body instanceof ArrayBuffer ? body : null;
  if (originalChatBody) {
    try {
      const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(originalChatBody));
      // The native /v1/chat contract owns its conversation context. This
      // browser-only snapshot is for the legacy broker bridge exclusively;
      // never send the extra field to a newer native Chat route.
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
          Object.hasOwn(parsed, 'context')) {
        const { context: _browserContext, ...nativeRequest } = parsed;
        body = JSON.stringify(nativeRequest);
      }
    } catch {
      // Preserve original payload; the native API can return its normal 400.
    }
  }

  let upstream = await fetch(route.url, {
    method: route.method,
    headers: forwardedHeaders(request, session.accessToken, body != null),
    body: ['GET', 'HEAD'].includes(route.method) ? undefined : body,
    redirect: 'manual',
    signal: request.signal,
  });

  // v53 production API omitted the chat route from its deployed bundle.
  // Only fall back if the upstream explicitly says the ROUTE is missing,
  // never for permission errors or missing account-owned resources. Once a
  // compatible API is deployed its native chat implementation takes priority.
  if (originalChatBody && upstream.status === 404) {
    const upstreamError = await upstream.clone().json().catch(() => null);
    if (upstreamError?.error?.code === 'not_found') {
      let parsed;
      try {
        parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(originalChatBody));
      } catch {
        return json({ error: { code: 'invalid_request' } }, 400);
      }
      let payload;
      try {
        payload = legacyBrokerChatPayload(
          relativePath, parsed, env.MEO_OAUTH_CLIENT_ID,
        );
      } catch {
        return json({ error: { code: 'invalid_request' } }, 400);
      }
      await upstream.body?.cancel().catch(() => undefined);
      upstream = await fetch(brokerUrl(env), {
        method: 'POST',
        headers: forwardedHeaders(request, session.accessToken, true),
        body: JSON.stringify(payload),
        redirect: 'manual',
        signal: request.signal,
      });
    }
  }

  const response = new Response(upstream.body, {
    status: upstream.status,
    headers: downstreamHeaders(upstream),
  });
  if (cookie) response.headers.append('Set-Cookie', cookie);

  // A 401 from api.meoarch.org means the API rejected the forwarded OAuth
  // access token. It does not prove that the browser's encrypted Meo session
  // cookie is invalid: loadSession already established that separately. Clearing
  // browser cookies here turns a resource-server configuration bug into an
  // apparent sign-out loop, so preserve the browser session and let the client
  // surface the upstream error instead.
  if (upstream.status === 401) {
    response.headers.set('X-Meo-Upstream-Auth-Failure', '1');
  }
  return response;
}
