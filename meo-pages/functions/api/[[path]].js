import { accountUser, apiUrl, authHeaders, brokerUrl, loadSession } from '../_lib/account.js';
import { clearCookies } from '../_lib/session.js';

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

class ApiFailure extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function upstreamFailure(status, fallback) {
  if (status === 401) return new ApiFailure(401, 'Meo Account 登录已失效，请重新登录。');
  if (status === 403) return new ApiFailure(403, '需要完成账号验证，或此操作未获授权。');
  if (status === 404) return new ApiFailure(404, '请求的资源不存在。');
  if (status === 409) return new ApiFailure(409, '本次确认已过期或内容已变化，请重新确认。');
  if (status === 429) return new ApiFailure(429, '请求过于频繁，请稍后再试。');
  if ([400, 413, 415, 422].includes(status)) return new ApiFailure(status, fallback);
  return new ApiFailure(
    status >= 500 && status <= 599 ? status : 502,
    '服务暂时不可用，请稍后再试。',
  );
}

async function rejectedUpstream(response, fallback) {
  if (response.status === 403) {
    const payload = await response.json().catch(() => null);
    const code = payload?.error?.code;
    if (['email_verification_required', 'account_activation_required'].includes(code))
      return new ApiFailure(403, '请前往 Meo Account 完成账号验证。', code);
  }
  return upstreamFailure(response.status, fallback);
}

export function parseConversationCursor(cursor) {
  if (!cursor) return null;
  try {
    if (typeof cursor !== 'string' || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor))
      throw new Error();
    const parsed = JSON.parse(atob(cursor.replaceAll('-', '+').replaceAll('_', '/')));
    if (!Array.isArray(parsed) || parsed.length !== 2) throw new Error();
    const [updatedAt, id] = parsed;
    if (
      typeof updatedAt !== 'string' ||
      typeof id !== 'string' ||
      !timestampPattern.test(updatedAt) ||
      Number.isNaN(Date.parse(updatedAt)) ||
      !uuidPattern.test(id)
    )
      throw new Error();
    return { updatedAt, id };
  } catch {
    throw new ApiFailure(400, '会话分页位置无效。');
  }
}

function encodeConversationCursor(row) {
  return btoa(JSON.stringify([row.updated_at, row.id]))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

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
  if (length > 64_000) throw new ApiFailure(413, '请求内容过大。');
  const text = await request.text();
  if (text.length > 64_000) throw new ApiFailure(413, '请求内容过大。');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ApiFailure(400, '请求格式无效。');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ApiFailure(400, '请求格式无效。');
  return value;
}

function requiredText(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new ApiFailure(400, `${label} 无效。`);
  return value.trim();
}

function chatInput(body) {
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 80)
    throw new ApiFailure(400, '对话上下文无效。');
  const messages = body.messages.map((message) => {
    if (!message || !['user', 'assistant'].includes(message.role))
      throw new ApiFailure(400, '对话消息无效。');
    return { role: message.role, content: requiredText(message.content, 40_000, 'Message') };
  });
  if (messages.at(-1)?.role !== 'user') throw new ApiFailure(400, '最后一条消息必须来自用户。');
  const history = messages
    .slice(0, -1)
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
    .join('\n\n');
  const current = messages.at(-1).content;
  const userPrompt = history ? `Conversation so far:\n${history}\n\nUser: ${current}` : current;
  if (userPrompt.length > 40_000) throw new ApiFailure(413, '对话上下文过长。');
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
  });
}

async function meoApi(request, env, session, path, init = {}) {
  return fetch(`${apiUrl(env)}/v1/${path}`, {
    ...init,
    headers: authHeaders(env, session.accessToken, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(init.headers ?? {}),
    }),
  });
}

async function responseJson(response, fallback) {
  if (!response.ok) throw await rejectedUpstream(response, fallback);
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw new ApiFailure(502, '服务返回的数据无法读取。');
  }
}

async function route(request, env, session, user, pathname) {
  const url = new URL(request.url);
  const method = request.method;
  const userId = user.id;
  if (pathname === '/api/session' && method === 'GET')
    return json({ userId, email: typeof user.email === 'string' ? user.email : '' });
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
    const before = parseConversationCursor(url.searchParams.get('cursor'));
    const rows = await responseJson(
      await meoApi(
        request,
        env,
        session,
        `conversations${before ? `?cursor=${encodeURIComponent(encodeConversationCursor({ updated_at: before.updatedAt, id: before.id }))}` : ''}`,
      ),
      'Conversation history is unavailable',
    );
    if (!Array.isArray(rows?.conversations)) throw new ApiFailure(502, '会话列表无法读取。');
    const conversations = rows.conversations;
    return json({
      conversations,
      nextCursor: typeof rows.nextCursor === 'string' ? rows.nextCursor : null,
    });
  }
  if (pathname === '/api/conversations' && method === 'POST') {
    const body = await bodyJson(request);
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
    const result = await meoApi(request, env, session, 'conversations', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    const rows = await responseJson(result, 'Conversation could not be created');
    if (!rows?.conversation) throw new ApiFailure(502, '无法创建会话。');
    return json({ conversation: rows.conversation }, 201);
  }
  const messagesMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (messagesMatch && uuidPattern.test(messagesMatch[1])) {
    const conversationId = messagesMatch[1];
    if (method === 'GET') {
      const rows = await responseJson(
        await meoApi(request, env, session, `conversations/${conversationId}/messages`),
        'Conversation messages are unavailable',
      );
      return json({ messages: Array.isArray(rows?.messages) ? rows.messages : [] });
    }
    if (method === 'POST') {
      const body = await bodyJson(request);
      const role = body.role;
      if (!['user', 'assistant'].includes(role)) throw new ApiFailure(400, '消息角色无效。');
      const content = requiredText(body.content, 40_000, 'Message');
      const inserted = await responseJson(
        await meoApi(request, env, session, `conversations/${conversationId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ role, content }),
        }),
        'Message could not be saved',
      );
      if (!inserted?.message) throw new ApiFailure(502, '消息未能保存。');
      return json({ message: inserted.message }, 201);
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
      throw new ApiFailure(400, '授权确认无效。');
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
      throw upstream.ok
        ? new ApiFailure(502, 'AI 服务没有返回有效的数据流。')
        : await rejectedUpstream(upstream, 'AI 服务拒绝了本次请求。');
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
    const result = await route(request, env, session, user, pathname);
    if (cookie) result.headers.append('Set-Cookie', cookie);
    return result;
  } catch (error) {
    if (error instanceof ApiFailure)
      return json(
        { error: error.message, ...(error.code ? { code: error.code } : {}) },
        error.status,
      );
    return json({ error: 'Meo AI 暂时无法完成请求，请稍后再试。' }, 502);
  }
}
