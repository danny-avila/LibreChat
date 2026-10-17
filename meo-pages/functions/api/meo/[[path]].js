import { apiUrl, brokerUrl, loadSession } from '../../_lib/account.js';
import { clearCookies } from '../../_lib/session.js';

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

  if (relativePath === '/chat/prepare' && method === 'POST') {
    return { url: brokerUrl(env), method: 'POST', brokerAction: 'prepare_inference' };
  }

  if (relativePath === '/chat/stream' && method === 'POST') {
    return { url: brokerUrl(env), method: 'POST', brokerAction: 'stream_invoke' };
  }

  if (
    relativePath === '/conversations' ||
    /^\/conversations\/[^/]+\/messages$/.test(relativePath)
  ) {
    const target = new URL(`${apiUrl(env)}/v1${relativePath}`);
    target.search = new URL(request.url).search;
    return { url: target.toString(), method, body: null };
  }

  return null;
}

function chatBrokerBody(body, action, env) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new Error('invalid_chat_request');
  const credentialId = typeof body.credentialId === 'string' ? body.credentialId.trim() : '';
  const model = typeof body.model === 'string' ? body.model.trim() : '';
  const userPrompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!credentialId || !model || !userPrompt || userPrompt.length > 40_000)
    throw new Error('invalid_chat_request');
  const payload = {
    action,
    credentialId,
    clientId: env.MEO_OAUTH_CLIENT_ID,
    purpose: 'meo_ai_web_chat',
    dataCategories: ['chat_text'],
    model,
    userPrompt,
    temperature: 0.7,
    maxOutputTokens: 2048,
  };
  if (action !== 'stream_invoke') return payload;
  const consent = body.consent;
  if (!consent || typeof consent !== 'object' || Array.isArray(consent))
    throw new Error('invalid_chat_consent');
  return {
    ...payload,
    consent: {
      approved: true,
      confirmedAt: new Date().toISOString(),
      requestId: consent.requestId,
      payloadSha256: consent.payloadSha256,
      confirmationVersion: consent.confirmationVersion,
    },
  };
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

  const { session, cookie } = await loadSession(request, env);
  if (!session) {
    const response = json({ error: { code: 'unauthenticated' } }, 401);
    for (const value of clearCookies()) response.headers.append('Set-Cookie', value);
    return response;
  }

  let body = route.body;
  if (route.brokerAction) {
    try {
      body = JSON.stringify(chatBrokerBody(await request.json(), route.brokerAction, env));
    } catch {
      return json({ error: { code: 'invalid_chat_request' } }, 400);
    }
  }
  if (body == null && !['GET', 'HEAD'].includes(route.method)) {
    body = await request.arrayBuffer();
  }

  const upstream = await fetch(route.url, {
    method: route.method,
    headers: forwardedHeaders(request, session.accessToken, body != null),
    body: ['GET', 'HEAD'].includes(route.method) ? undefined : body,
    redirect: 'manual',
  });

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
