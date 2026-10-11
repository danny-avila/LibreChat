import { accountUser, authHeaders, brokerUrl, loadSession } from '../_lib/account.js';
import { clearCookies } from '../_lib/session.js';

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { ...jsonHeaders, ...headers } });
}

function safeOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return ['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function bodyJson(request) {
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (length > 64_000) throw new Error('Request is too large');
  const text = await request.text();
  if (text.length > 64_000) throw new Error('Request is too large');
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid request');
  return value;
}

function requiredText(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new Error(`${label} is invalid`);
  return value.trim();
}

function chatInput(body) {
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 80)
    throw new Error('Chat context is invalid');
  const messages = body.messages.map((message) => {
    if (!message || !['user', 'assistant'].includes(message.role))
      throw new Error('Chat message is invalid');
    return { role: message.role, content: requiredText(message.content, 40_000, 'Message') };
  });
  if (messages.at(-1)?.role !== 'user') throw new Error('The latest message must be from the user');
  const history = messages
    .slice(0, -1)
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
    .join('\n\n');
  const current = messages.at(-1).content;
  const userPrompt = history ? `Conversation so far:\n${history}\n\nUser: ${current}` : current;
  if (userPrompt.length > 40_000) throw new Error('Chat context is too large');
  return {
    credentialId: requiredText(body.credentialId, 80, 'Connection'),
    model: requiredText(body.model, 160, 'Model'),
    messages,
    userPrompt,
    dataCategories: history ? ['chat_text', 'conversation_context'] : ['chat_text'],
  };
}

async function broker(request, env, session, body, acceptStream = false) {
  return fetch(brokerUrl(env), {
    method: 'POST',
    headers: authHeaders(env, session.accessToken, {
      'Content-Type': 'application/json',
      ...(acceptStream ? { Accept: 'text/event-stream' } : {}),
      'Cache-Control': 'no-store',
    }),
    body: JSON.stringify(body),
    cache: 'no-store',
    redirect: 'error',
    signal: request.signal,
  });
}

async function db(request, env, session, path, init = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: authHeaders(env, session.accessToken, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(init.headers ?? {}),
    }),
    cache: 'no-store',
    redirect: 'error',
    signal: request.signal,
  });
}

async function responseJson(response, fallback) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(fallback);
  return data;
}

async function route(request, env, session, userId, pathname) {
  const url = new URL(request.url);
  const method = request.method;
  if (pathname === '/api/session' && method === 'GET') return json({ userId });
  if (pathname === '/api/logout' && method === 'POST') {
    const response = json({ ok: true });
    for (const cookie of clearCookies()) response.headers.append('Set-Cookie', cookie);
    return response;
  }
  if (pathname === '/api/connections' && method === 'GET') {
    const upstream = await broker(request, env, session, { action: 'list_credentials' });
    const data = await responseJson(upstream, 'Account connection list is unavailable');
    return json({ connections: Array.isArray(data.credentials) ? data.credentials : [] });
  }
  if (pathname === '/api/models' && method === 'GET') {
    const credentialId = requiredText(url.searchParams.get('connection'), 80, 'Connection');
    const upstream = await broker(request, env, session, { action: 'list_models', credentialId });
    const data = await responseJson(upstream, 'Model list is unavailable');
    return json({
      supported: data.supported === true,
      models: Array.isArray(data.models) ? data.models : [],
    });
  }
  if (pathname === '/api/conversations' && method === 'GET') {
    const query = new URLSearchParams({
      select: 'id,title,created_at,updated_at',
      order: 'updated_at.desc,id.desc',
      limit: '50',
    });
    const rows = await responseJson(
      await db(request, env, session, `ai_conversations?${query}`),
      'Conversation history is unavailable',
    );
    return json({ conversations: Array.isArray(rows) ? rows : [] });
  }
  if (pathname === '/api/conversations' && method === 'POST') {
    const body = await bodyJson(request);
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
    const result = await db(
      request,
      env,
      session,
      'ai_conversations?select=id,title,created_at,updated_at',
      {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ user_id: userId, title }),
      },
    );
    const rows = await responseJson(result, 'Conversation could not be created');
    if (!Array.isArray(rows) || !rows[0]) throw new Error('Conversation could not be created');
    return json({ conversation: rows[0] }, 201);
  }
  const messagesMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (messagesMatch && uuidPattern.test(messagesMatch[1])) {
    const conversationId = messagesMatch[1];
    if (method === 'GET') {
      const query = new URLSearchParams({
        select: 'id,conversation_id,role,executor,content,created_at',
        conversation_id: `eq.${conversationId}`,
        order: 'created_at.asc,id.asc',
        limit: '500',
      });
      const rows = await responseJson(
        await db(request, env, session, `ai_messages?${query}`),
        'Conversation messages are unavailable',
      );
      return json({ messages: Array.isArray(rows) ? rows : [] });
    }
    if (method === 'POST') {
      const body = await bodyJson(request);
      const role = body.role;
      if (!['user', 'assistant'].includes(role)) throw new Error('Message role is invalid');
      const content = requiredText(body.content, 40_000, 'Message');
      const params = new URLSearchParams({
        select: 'id,conversation_id,role,executor,content,created_at',
      });
      const inserted = await responseJson(
        await db(request, env, session, `ai_messages?${params}`, {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            user_id: userId,
            conversation_id: conversationId,
            role,
            executor: 'chat',
            content: [{ type: 'text', text: content }],
          }),
        }),
        'Message could not be saved',
      );
      const updatedAt = new Date().toISOString();
      await responseJson(
        await db(request, env, session, `ai_conversations?id=eq.${conversationId}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ updated_at: updatedAt }),
        }),
        'Conversation timestamp could not be updated',
      );
      if (!Array.isArray(inserted) || !inserted[0]) throw new Error('Message could not be saved');
      return json({ message: inserted[0] }, 201);
    }
  }
  if (pathname === '/api/chat/prepare' && method === 'POST') {
    const input = chatInput(await bodyJson(request));
    const upstream = await broker(request, env, session, {
      action: 'prepare_inference',
      credentialId: input.credentialId,
      clientId: env.MEO_OAUTH_CLIENT_ID,
      purpose: 'meo_ai_web_chat',
      dataCategories: input.dataCategories,
      model: input.model,
      userPrompt: input.userPrompt,
      temperature: 0.7,
      maxOutputTokens: 2048,
    });
    return json(await responseJson(upstream, 'Consent preview is unavailable'));
  }
  if (pathname === '/api/chat/stream' && method === 'POST') {
    const body = await bodyJson(request);
    const input = chatInput(body);
    const consent = body.consent;
    if (
      !consent ||
      typeof consent !== 'object' ||
      consent.confirmationVersion !== 1 ||
      typeof consent.requestId !== 'string' ||
      typeof consent.payloadSha256 !== 'string'
    ) {
      throw new Error('Consent confirmation is invalid');
    }
    const upstream = await broker(
      request,
      env,
      session,
      {
        action: 'stream_invoke',
        credentialId: input.credentialId,
        clientId: env.MEO_OAUTH_CLIENT_ID,
        purpose: 'meo_ai_web_chat',
        dataCategories: input.dataCategories,
        model: input.model,
        userPrompt: input.userPrompt,
        temperature: 0.7,
        maxOutputTokens: 2048,
        consent: {
          approved: true,
          confirmedAt: new Date().toISOString(),
          requestId: consent.requestId,
          payloadSha256: consent.payloadSha256,
          confirmationVersion: 1,
        },
      },
      true,
    );
    if (
      !upstream.ok ||
      !upstream.body ||
      !upstream.headers.get('Content-Type')?.includes('text/event-stream')
    ) {
      const data = await upstream.json().catch(() => null);
      return json(
        { error: data?.error ?? 'Provider stream could not be opened' },
        upstream.status || 502,
      );
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  }
  return json({ error: 'Not found' }, 404);
}

export async function onRequest({ request, env }) {
  if (!safeOrigin(request)) return json({ error: 'Request origin is not allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  try {
    const { session, cookie } = await loadSession(request, env);
    if (!session) return json({ error: 'Sign in with Meo Account to continue' }, 401);
    const user = await accountUser(env, session.accessToken);
    if (!user || user.id !== session.userId)
      return json({ error: 'Meo Account session is invalid' }, 401);
    const pathname = new URL(request.url).pathname;
    const result = await route(request, env, session, user.id, pathname);
    if (cookie) result.headers.append('Set-Cookie', cookie);
    return result;
  } catch {
    return json({ error: 'Meo AI could not complete that request. Please try again.' }, 400);
  }
}
