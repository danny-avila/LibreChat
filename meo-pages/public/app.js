import { chatContext, requestedSelection, safeMarkdown, SseParser } from './core.js';

const root = document.querySelector('#app');
const state = {
  userId: '',
  email: '',
  connections: [],
  history: [],
  historyCursor: null,
  historyLoading: false,
  historyGeneration: 0,
  conversationLoadGeneration: 0,
  modelLoadGeneration: 0,
  messages: [],
  conversationId: '',
  connection: null,
  model: '',
  models: [],
  modelSupported: false,
  busy: false,
  draft: '',
  retryAvailable: false,
  error: '',
  notice: '',
  mobileMenu: false,
};

const t = (key) =>
  ({
    invalid_connection: '链接中的连接不属于当前账号，已切换到可用连接。',
    invalid_model: '链接中的模型不可用于此连接，已切换到默认模型。',
    no_connection: '请先在 Meo Account 添加 AI provider 连接。',
    saved: '会话已同步到 Meo Cloud。',
  })[key] ?? key;

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function')
      node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== null && value !== undefined) node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

async function api(path, init = {}) {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    cache: 'no-store',
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const error = new Error(data?.error ?? `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response;
}

async function json(path, init) {
  return (await api(path, init)).json();
}

function deepLink() {
  const params = new URLSearchParams();
  if (state.connection?.id) params.set('connection', state.connection.id);
  if (state.model) params.set('model', state.model);
  history.replaceState(null, '', `/new${params.size ? `?${params}` : ''}`);
}

function selectedConversationKey() {
  return `meo.selectedConversation.${state.userId}`;
}

function formatMessage(row) {
  let content = row.content;
  if (Array.isArray(content)) content = content.map((part) => part?.text ?? '').join('');
  return { id: row.id ?? crypto.randomUUID(), role: row.role, content: String(content ?? '') };
}

async function loadModels(connectionId) {
  const generation = ++state.modelLoadGeneration;
  const result = await json(`/api/models?connection=${encodeURIComponent(connectionId)}`);
  if (generation !== state.modelLoadGeneration || state.connection?.id !== connectionId) return;
  state.models = result.models;
  state.modelSupported = result.supported;
  const selection = requestedSelection(location.search, [state.connection], result);
  if (
    !selection.model ||
    (result.supported && !result.models.some((item) => item.id === selection.model))
  ) {
    state.model = state.connection.defaultModel || result.models[0]?.id || '';
  } else state.model = selection.model;
  if (selection.warning) state.notice = t(selection.warning);
  deepLink();
}

async function loadConnections() {
  const result = await json('/api/connections');
  state.connections = result.connections.filter((connection) => connection.enabled === true);
  const requested = new URLSearchParams(location.search).get('connection') ?? '';
  state.connection =
    state.connections.find((item) => item.id === requested) ?? state.connections[0] ?? null;
  if (requested && (!state.connection || state.connection.id !== requested))
    state.notice = t('invalid_connection');
  if (state.connection) await loadModels(state.connection.id);
  else {
    state.model = '';
    state.models = [];
    state.notice = t('no_connection');
  }
}

async function loadHistory() {
  const generation = ++state.historyGeneration;
  const result = await json('/api/conversations');
  if (generation !== state.historyGeneration) return;
  state.history = result.conversations;
  state.historyCursor = result.nextCursor;
  const requested = localStorage.getItem(selectedConversationKey()) ?? '';
  const conversation = state.history.find((item) => item.id === requested);
  if (conversation) await openConversation(conversation.id, false);
}

async function loadMoreHistory() {
  if (!state.historyCursor || state.historyLoading || state.busy) return;
  const generation = state.historyGeneration;
  state.historyLoading = true;
  render();
  try {
    const page = await json(`/api/conversations?cursor=${encodeURIComponent(state.historyCursor)}`);
    if (generation !== state.historyGeneration) return;
    const known = new Set(state.history.map((item) => item.id));
    state.history.push(...page.conversations.filter((item) => !known.has(item.id)));
    state.historyCursor = page.nextCursor;
  } catch (error) {
    if (generation === state.historyGeneration) state.error = error.message;
  } finally {
    if (generation === state.historyGeneration) {
      state.historyLoading = false;
      render();
    }
  }
}

async function openConversation(id, persist = true) {
  if (state.busy) return;
  const generation = ++state.conversationLoadGeneration;
  try {
    const result = await json(`/api/conversations/${encodeURIComponent(id)}/messages`);
    if (generation !== state.conversationLoadGeneration) return;
    state.conversationId = id;
    state.messages = result.messages.map(formatMessage);
    state.retryAvailable = state.messages.at(-1)?.role === 'user';
    state.error = '';
    if (persist) localStorage.setItem(selectedConversationKey(), id);
  } catch (error) {
    if (generation !== state.conversationLoadGeneration) return;
    state.error = error.message;
  }
  render();
}

async function newConversation() {
  if (state.busy) return;
  state.conversationLoadGeneration += 1;
  state.conversationId = '';
  state.messages = [];
  state.retryAvailable = false;
  state.draft = '';
  localStorage.removeItem(selectedConversationKey());
  state.error = '';
  render();
}

function renderLogin() {
  const returnTo = `${location.pathname}${location.search}`;
  root.replaceChildren(
    el('main', { class: 'login' }, [
      el('section', { class: 'login-card' }, [
        el('span', { class: 'brand-mark', text: 'm' }),
        el('h1', { text: '欢迎来到 Meo AI' }),
        el('p', {
          text: '使用 Meo Account 登录。你的 provider key 由 Account 保管，会话历史安全同步到云端。',
        }),
        el('a', {
          class: 'button primary',
          href: `/oauth/openid?return=${encodeURIComponent(returnTo.startsWith('/new') ? returnTo : '/new')}`,
          text: '使用 Meo Account 登录',
        }),
      ]),
    ]),
  );
}

function renderSidebar() {
  const brand = el('div', { class: 'brand' }, [
    el('span', { class: 'brand-mark', text: 'm' }),
    el('span', { text: 'Meo AI' }),
  ]);
  const newButton = el('button', {
    class: 'button primary',
    text: '＋  新建对话',
    onclick: newConversation,
    disabled: state.busy,
  });
  const historyTitle = el('div', { class: 'sidebar-heading' }, [el('span', { text: '最近会话' })]);
  const items = state.history.length
    ? state.history.map((conversation) =>
        el('button', {
          class: `history-item${conversation.id === state.conversationId ? ' active' : ''}`,
          title: conversation.title || '新对话',
          text: conversation.title || '新对话',
          onclick: () => openConversation(conversation.id),
          disabled: state.busy,
        }),
      )
    : [el('div', { class: 'empty', text: '你的云端会话会显示在这里。' })];
  const history = el('div', { class: 'history' }, items);
  if (state.historyCursor)
    history.append(
      el('button', {
        class: 'button ghost',
        text: state.historyLoading ? '加载中…' : '加载更多',
        disabled: state.historyLoading || state.busy,
        onclick: loadMoreHistory,
      }),
    );
  const signout = el('button', {
    class: 'button ghost',
    text: '退出登录',
    disabled: state.busy,
    onclick: async () => {
      try {
        await api('/api/logout', { method: 'POST' });
        location.reload();
      } catch (error) {
        state.error = error.message;
        render();
      }
    },
  });
  const switchAccount = el('button', {
    class: 'button ghost',
    text: '切换账号',
    disabled: state.busy,
    onclick: async () => {
      try {
        await api('/api/logout', { method: 'POST' });
        location.assign('https://account.meoarch.org/ai/switch-account');
      } catch (error) {
        state.error = error.message;
        render();
      }
    },
  });
  return el('aside', { class: 'sidebar' }, [
    brand,
    el('div', { class: 'sidebar-actions' }, [newButton]),
    historyTitle,
    history,
    el('div', { class: 'sidebar-footer' }, [
      el('div', { class: 'account-identity', text: state.email || 'Meo Account' }),
      el('a', {
        class: 'button ghost',
        href: 'https://account.meoarch.org/settings/profile',
        text: '管理账号',
      }),
      switchAccount,
      el('div', { text: 'Provider key 仅由 Meo Account 保存和使用。' }),
      signout,
    ]),
  ]);
}

function makeSelect(items, selected, change) {
  const select = el('select', { class: 'select', onchange: (event) => change(event.target.value) });
  for (const item of items) {
    const option = el('option', { value: item.value, text: item.label });
    if (item.value === selected) option.selected = true;
    select.append(option);
  }
  return select;
}

function renderTopbar() {
  const connectionItems = state.connections.map((item) => ({
    value: item.id,
    label: item.displayName || item.provider,
  }));
  const connectionSelect = makeSelect(connectionItems, state.connection?.id, async (id) => {
    if (state.busy) return;
    state.connection = state.connections.find((item) => item.id === id) ?? null;
    try {
      await loadModels(id);
      state.error = '';
    } catch (error) {
      state.error = error.message;
    }
    render();
  });
  connectionSelect.setAttribute('aria-label', 'AI connection');
  connectionSelect.disabled = state.busy;
  let modelControl;
  if (state.modelSupported && state.models.length) {
    modelControl = makeSelect(
      state.models.map((model) => ({ value: model.id, label: model.name || model.id })),
      state.model,
      (model) => {
        state.model = model;
        deepLink();
        render();
      },
    );
  } else {
    modelControl = el('input', {
      class: 'select',
      placeholder: '输入 model ID',
      value: state.model,
      'aria-label': 'Model ID',
      oninput: (event) => {
        state.model = event.target.value;
        deepLink();
      },
    });
  }
  const user = el('span', {
    class: 'topbar-title',
    text: state.email ? `当前账号：${state.email}` : 'Meo Account 已连接',
  });
  modelControl.disabled = state.busy;
  const menu = el('button', {
    class: 'button menu-toggle',
    text: '☰',
    'aria-label': '打开侧栏',
    onclick: () => {
      state.mobileMenu = !state.mobileMenu;
      render();
    },
  });
  return el('header', { class: 'topbar' }, [
    el('div', {}, [menu, user]),
    el('div', { class: 'topbar-controls' }, [connectionSelect, modelControl]),
  ]);
}

function renderMessage(message) {
  const body = el('div', { class: 'message-body' });
  body.innerHTML = safeMarkdown(message.content);
  return el('article', { class: `message ${message.role}` }, [
    el('div', { class: 'avatar', text: message.role === 'user' ? '你' : 'm' }),
    body,
  ]);
}

function openConsent(consent, approve, deny) {
  const summary = consent;
  const overlay = el('div', {
    class: 'overlay',
    onclick: (event) => {
      if (event.target === overlay) deny();
    },
  });
  const dialog = el(
    'section',
    { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'consent-title' },
    [
      el('h2', { id: 'consent-title', text: '确认发送给 AI provider' }),
      el('p', { text: '这次请求将发送到以下 provider。请确认内容和目的。' }),
      el('dl', {}, [
        el('dt', { text: 'Provider' }),
        el('dd', { text: summary.providerName ?? summary.provider ?? 'Meo Account connection' }),
        el('dt', { text: '模型' }),
        el('dd', { text: summary.model ?? state.model }),
        el('dt', { text: '用途' }),
        el('dd', { text: summary.purpose ?? 'meo_ai_web_chat' }),
        el('dt', { text: '数据类型' }),
        el('dd', { text: (summary.dataCategories ?? []).join('、') || 'chat_text' }),
        el('dt', { text: '输入长度' }),
        el('dd', { text: `${summary.promptCharacters ?? 0} 字符` }),
      ]),
      el('div', { class: 'dialog-actions' }, [
        el('button', { class: 'button', text: '取消', onclick: deny }),
        el('button', { class: 'button primary', text: '同意并发送', onclick: approve }),
      ]),
    ],
  );
  overlay.append(dialog);
  document.body.append(overlay);
  return () => overlay.remove();
}

async function persistMessage(conversationId, role, content) {
  await json(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ role, content }),
  });
}

async function sendMessage(text, retry = false) {
  const content = retry ? (state.messages.at(-1)?.content ?? '') : text.trim();
  if (
    !content ||
    state.busy ||
    !state.connection ||
    !state.model ||
    (retry && !state.retryAvailable)
  )
    return;
  let savedUser = retry;
  let assistantPersisted = false;
  let assistant = null;
  state.busy = true;
  state.error = '';
  state.notice = '';
  render();
  try {
    if (!retry) {
      if (!state.conversationId) {
        const result = await json('/api/conversations', {
          method: 'POST',
          body: JSON.stringify({ title: content.slice(0, 64) }),
        });
        state.conversationId = result.conversation.id;
        state.history.unshift(result.conversation);
        localStorage.setItem(selectedConversationKey(), state.conversationId);
      }
      await persistMessage(state.conversationId, 'user', content);
      savedUser = true;
      state.messages.push({ id: crypto.randomUUID(), role: 'user', content });
      state.draft = '';
    }
    state.retryAvailable = true;
    const requestMessages = chatContext(state.messages);
    render();
    const prepared = await json('/api/chat/prepare', {
      method: 'POST',
      body: JSON.stringify({
        connection: state.connection.id,
        credentialId: state.connection.id,
        model: state.model,
        messages: requestMessages,
      }),
    });
    const consent = prepared.consent;
    if (!consent) throw new Error('Consent details were not returned');
    await new Promise((resolve, reject) => {
      let close = () => {};
      close = openConsent(
        consent,
        () => {
          close();
          resolve();
        },
        () => {
          close();
          reject(new Error('Request cancelled'));
        },
      );
    });
    assistant = { id: crypto.randomUUID(), role: 'assistant', content: '' };
    state.messages.push(assistant);
    render();
    const response = await api('/api/chat/stream', {
      method: 'POST',
      body: JSON.stringify({
        credentialId: state.connection.id,
        model: state.model,
        messages: requestMessages,
        consent,
      }),
    });
    if (!response.body) throw new Error('Provider stream is empty');
    let completed = false;
    const parser = new SseParser((event, data) => {
      if (event === 'delta' && typeof data.text === 'string') {
        assistant.content += data.text;
        renderMessages();
      }
      if (event === 'done') completed = true;
      if (event === 'error') throw new Error(data.message ?? 'Provider stream failed');
    });
    const reader = response.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      parser.push(value, done);
      if (done) break;
    }
    if (!completed || !assistant.content) throw new Error('AI 回复未完整结束，请重试。');
    await persistMessage(state.conversationId, 'assistant', assistant.content);
    assistantPersisted = true;
    state.retryAvailable = false;
    state.notice = t('saved');
    await loadHistory();
  } catch (error) {
    if (error.message !== 'Request cancelled') state.error = error.message;
    if (!assistantPersisted && assistant && state.messages.at(-1) === assistant)
      state.messages.pop();
    state.retryAvailable = savedUser && !assistantPersisted;
  } finally {
    state.busy = false;
    render();
  }
}

function renderMessages() {
  const list = document.querySelector('.messages');
  if (!list) return;
  list.replaceChildren(...state.messages.map(renderMessage));
  list.scrollIntoView({ block: 'end', behavior: 'smooth' });
}

function renderMain() {
  const empty = state.messages.length === 0;
  const welcome = empty
    ? el('section', { class: 'welcome' }, [
        el('span', { class: 'brand-mark', text: 'm' }),
        el('h1', { text: '今天想聊些什么？' }),
        el('p', { text: '选择 Account 连接和模型，开始一段安全、可同步的对话。' }),
        ...(!state.connection
          ? [
              el('a', {
                class: 'button primary',
                href: 'https://account.meoarch.org/settings/services',
                text: '在 Account 添加 AI 连接',
              }),
              el('button', {
                class: 'button ghost',
                text: '重新检查连接',
                onclick: async () => {
                  try {
                    await loadConnections();
                    state.error = '';
                  } catch (error) {
                    state.error = error.message;
                  }
                  render();
                },
              }),
            ]
          : []),
      ])
    : null;
  const messages = el(
    'div',
    { class: 'messages', id: 'messages' },
    state.messages.map(renderMessage),
  );
  const scroll = el('div', { class: 'chat-scroll' }, [
    el('div', { class: 'chat-inner' }, [...(welcome ? [welcome] : []), messages]),
  ]);
  const textarea = el('textarea', {
    placeholder: '给 Meo AI 发消息…',
    'aria-label': '消息内容',
    maxlength: 35000,
    disabled: !state.connection || !state.model || state.busy,
    onkeydown: (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const value = event.target.value;
        sendMessage(value);
      }
    },
  });
  textarea.value = state.draft;
  const send = el('button', {
    class: 'send',
    text: state.busy ? '…' : '↑',
    title: '发送',
    disabled: !state.connection || !state.model || state.busy,
    onclick: () => {
      sendMessage(textarea.value);
    },
  });
  textarea.addEventListener('input', () => {
    state.draft = textarea.value;
    send.disabled = !textarea.value.trim() || state.busy || !state.connection || !state.model;
  });
  send.disabled = !state.draft.trim() || state.busy || !state.connection || !state.model;
  const composer = el('footer', { class: 'composer-wrap' }, [
    el('div', { class: 'composer' }, [textarea, send]),
    ...(state.retryAvailable
      ? [
          el('button', {
            class: 'button ghost',
            text: '重试回复',
            disabled: state.busy,
            onclick: () => sendMessage('', true),
          }),
        ]
      : []),
    el('div', {
      class: 'hint',
      text: 'AI 回复可能不准确。发送前会显示 Account 的本次请求授权摘要。',
    }),
    ...(state.error
      ? [el('div', { class: 'notice error', role: 'alert', text: state.error })]
      : []),
    ...(state.notice ? [el('div', { class: 'notice', role: 'status', text: state.notice })] : []),
  ]);
  return el('main', { class: 'main' }, [renderTopbar(), scroll, composer]);
}

function render() {
  const shell = el('div', { class: `shell${state.mobileMenu ? ' menu-open' : ''}` }, [
    renderSidebar(),
    renderMain(),
  ]);
  root.replaceChildren(shell);
}

async function boot() {
  try {
    const session = await json('/api/session');
    state.userId = session.userId;
    state.email = session.email;
    localStorage.removeItem('meo.selectedConversation');
    await Promise.all([loadConnections(), loadHistory()]);
    render();
  } catch (error) {
    if (error.status === 401) {
      renderLogin();
      return;
    }
    root.replaceChildren(
      el('main', { class: 'login' }, [
        el('section', { class: 'login-card' }, [
          el('h1', { text: 'Meo AI 暂时无法加载' }),
          el('p', { text: error.message || '请检查网络后重试。' }),
          el('button', { class: 'button primary', text: '重试', onclick: boot }),
        ]),
      ]),
    );
  }
}

boot();
