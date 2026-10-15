import {
  chatContext,
  requestedSelection,
  retryableUserContent,
  safeMarkdown,
  SseParser,
} from './core.js';

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
  accountAction: '',
  notice: '',
  mobileMenu: false,
  abortController: null,
  streamReader: null,
  cancelRequested: false,
};

const t = (key) =>
  ({
    invalid_connection: '链接中的连接不属于当前账号，已切换到可用连接。',
    invalid_model: '链接中的模型不可用于此连接，已切换到默认模型。',
    no_connection: '请先在 Meo Account 添加 AI provider 连接。',
    saved: '会话已同步到 Meo Cloud。',
    stopped: '已停止生成，并保留当前回复。',
  })[key] ?? key;

const examplePrompts = [
  '帮我把今天要做的事情整理成一个清晰的计划',
  '解释一个我不懂的概念，先用简单的话说明',
  '帮我检查这段文字，并告诉我最值得改的三点',
  '和我一起拆解一个项目问题，先找最可能的原因',
];

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function')
      node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, '');
    else if (value === false) continue;
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
    error.code = data?.code;
    throw error;
  }
  return response;
}

async function json(path, init) {
  return (await api(path, init)).json();
}

function friendlyError(error) {
  if (error?.code === 'account_activation_required')
    return '请完成人机验证，激活云端功能。草稿仍然保留。';
  if (error?.code === 'email_verification_required')
    return '请先验证 Meo Account 邮箱。草稿仍然保留。';
  if (error?.name === 'AbortError' || error?.message === 'Request cancelled') {
    return '这次请求已取消。已保存的会话内容不会受到影响。你可以修改内容后重新发送。';
  }
  if (error?.status === 401 || error?.status === 403) {
    return '登录或授权已失效。你的本地输入仍然保留，请重新登录或检查 Account 中的 provider 授权。';
  }
  if (error instanceof TypeError || /network|fetch/i.test(error?.message ?? '')) {
    return '网络连接失败。你的草稿仍然保留，请检查网络后重试。';
  }
  if ((error?.status ?? 0) >= 500 || /provider|stream|model/i.test(error?.message ?? '')) {
    return 'AI provider 暂时没有完成请求。你的已保存会话不会丢失，可以稍后重试或切换模型。';
  }
  return '这次操作没有完成。你的已保存会话不会丢失，请重试；如果问题持续出现，再检查连接与模型设置。';
}

function setError(error) {
  state.error = friendlyError(error);
  state.accountAction = '';
  if (error?.code === 'account_activation_required') state.accountAction = '/auth/activate';
  if (error?.code === 'email_verification_required') state.accountAction = '/auth/check-email';
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

function draftKey(conversationId = state.conversationId) {
  return `meo.draft.${state.userId}.${conversationId || 'new'}`;
}

function loadDraft(conversationId = state.conversationId) {
  try {
    return sessionStorage.getItem(draftKey(conversationId)) ?? '';
  } catch {
    return '';
  }
}

function saveDraft(value = state.draft, conversationId = state.conversationId) {
  state.draft = value;
  try {
    if (value) sessionStorage.setItem(draftKey(conversationId), value);
    else sessionStorage.removeItem(draftKey(conversationId));
  } catch {
    // Draft persistence is best-effort when storage is unavailable.
  }
}

function clearDraft(conversationId = state.conversationId) {
  saveDraft('', conversationId);
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
  else state.draft = loadDraft('');
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
    if (generation === state.historyGeneration) setError(error);
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
    state.draft = loadDraft(id);
    state.error = '';
    if (persist) localStorage.setItem(selectedConversationKey(), id);
  } catch (error) {
    if (generation !== state.conversationLoadGeneration) return;
    setError(error);
  }
  render();
}

async function newConversation() {
  if (state.busy) return;
  state.conversationLoadGeneration += 1;
  state.conversationId = '';
  state.messages = [];
  state.retryAvailable = false;
  state.draft = loadDraft('');
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
        setError(error);
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
        setError(error);
        render();
      }
    },
  });
  return el('aside', { class: 'sidebar', id: 'sidebar' }, [
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
      setError(error);
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
    'aria-label': state.mobileMenu ? '关闭侧栏' : '打开侧栏',
    'aria-expanded': state.mobileMenu ? 'true' : 'false',
    'aria-controls': 'sidebar',
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

function enhanceCodeBlocks(body) {
  for (const pre of body.querySelectorAll('pre')) {
    const button = el('button', {
      class: 'copy-code',
      text: '复制',
      'aria-label': '复制代码',
      onclick: async () => {
        const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
        await navigator.clipboard.writeText(code);
        button.textContent = '已复制';
        setTimeout(() => {
          button.textContent = '复制';
        }, 1200);
      },
    });
    pre.append(button);
  }
}

function renderMessage(message) {
  const body = el('div', { class: 'message-body' });
  body.innerHTML = safeMarkdown(message.content);
  enhanceCodeBlocks(body);
  if (message.transient)
    body.append(
      el('div', {
        class: 'message-status',
        text:
          message.transient === 'stopped' ? '已停止 · 这段回复未保存' : '回复中断 · 这段回复未保存',
      }),
    );
  const copy = el('button', {
    class: 'message-action',
    text: '复制',
    'aria-label': '复制消息',
    onclick: async () => {
      await navigator.clipboard.writeText(message.content);
      copy.textContent = '已复制';
      setTimeout(() => {
        copy.textContent = '复制';
      }, 1200);
    },
  });
  return el('article', { class: `message ${message.role}`, 'data-message-id': message.id }, [
    el('div', { class: 'avatar', text: message.role === 'user' ? '你' : 'm' }),
    el('div', { class: 'message-content' }, [
      body,
      el('div', { class: 'message-actions' }, [copy]),
    ]),
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
  dialog.querySelector('button')?.focus();
  return () => overlay.remove();
}

async function persistMessage(conversationId, role, content) {
  await json(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ role, content }),
  });
}

function cancelGeneration() {
  if (!state.busy) return;
  state.cancelRequested = true;
  state.abortController?.abort();
  state.streamReader?.cancel().catch(() => {});
}

function isNearBottom() {
  const scroll = document.querySelector('.chat-scroll');
  if (!scroll) return true;
  return scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 120;
}

function updateStreamingMessage(message) {
  const list = document.querySelector('.messages');
  if (!list) return;
  const follow = isNearBottom();
  const last = list.lastElementChild;
  if (last?.dataset.messageId === message.id) {
    const body = last.querySelector('.message-body');
    if (body) {
      body.innerHTML = safeMarkdown(message.content);
      enhanceCodeBlocks(body);
    }
  } else {
    list.append(renderMessage(message));
  }
  if (follow) {
    const scroll = document.querySelector('.chat-scroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }
}

async function sendMessage(text, retry = false) {
  const content = retry ? retryableUserContent(state.messages) : text.trim();
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
  let sourceDraftKey = state.conversationId;
  state.busy = true;
  state.cancelRequested = false;
  state.abortController = new AbortController();
  state.error = '';
  state.notice = '';
  if (state.messages.at(-1)?.transient) state.messages.pop();
  render();
  try {
    if (!retry) {
      if (!state.conversationId) {
        const result = await json('/api/conversations', {
          method: 'POST',
          signal: state.abortController.signal,
          body: JSON.stringify({ title: content.slice(0, 64) }),
        });
        state.conversationId = result.conversation.id;
        state.history.unshift(result.conversation);
        localStorage.setItem(selectedConversationKey(), state.conversationId);
      }
      await persistMessage(state.conversationId, 'user', content);
      savedUser = true;
      state.messages.push({ id: crypto.randomUUID(), role: 'user', content });
      clearDraft(sourceDraftKey);
      if (sourceDraftKey !== state.conversationId) clearDraft(state.conversationId);
    }
    state.retryAvailable = true;
    const requestMessages = chatContext(state.messages);
    render();
    const prepared = await json('/api/chat/prepare', {
      method: 'POST',
      signal: state.abortController.signal,
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
          reject(new DOMException('Request cancelled', 'AbortError'));
        },
      );
    });
    if (state.cancelRequested) throw new DOMException('Request cancelled', 'AbortError');
    assistant = { id: crypto.randomUUID(), role: 'assistant', content: '' };
    state.messages.push(assistant);
    render();
    const response = await api('/api/chat/stream', {
      method: 'POST',
      signal: state.abortController.signal,
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
        updateStreamingMessage(assistant);
      }
      if (event === 'done') completed = true;
      if (event === 'error') throw new Error(data.message ?? 'Provider stream failed');
    });
    const reader = response.body.getReader();
    state.streamReader = reader;
    while (true) {
      const { value, done } = await reader.read();
      parser.push(value, done);
      if (done) break;
    }
    if (state.cancelRequested) throw new DOMException('Request cancelled', 'AbortError');
    if (!completed || !assistant.content) throw new Error('AI 回复未完整结束，请重试。');
    await persistMessage(state.conversationId, 'assistant', assistant.content);
    assistantPersisted = true;
    state.retryAvailable = false;
    state.notice = t('saved');
    await loadHistory();
  } catch (error) {
    if (state.cancelRequested || error?.name === 'AbortError') {
      if (assistant?.content && !assistantPersisted) {
        try {
          await persistMessage(state.conversationId, 'assistant', assistant.content);
          assistantPersisted = true;
          state.notice = t('stopped');
        } catch {
          state.notice = '已停止生成。当前部分回复只保留在本页中。';
          assistant.transient = 'stopped';
        }
      } else if (!assistant?.content) {
        if (assistant && state.messages.at(-1) === assistant) state.messages.pop();
        state.notice = '已取消这次请求。';
      }
    } else {
      setError(error);
      if (!assistantPersisted && assistant && state.messages.at(-1) === assistant) {
        if (assistant.content) assistant.transient = 'failed';
        else state.messages.pop();
      }
    }
    state.retryAvailable = savedUser && !assistantPersisted;
  } finally {
    state.streamReader = null;
    state.abortController = null;
    state.cancelRequested = false;
    state.busy = false;
    render();
  }
}

function fillExample(prompt) {
  saveDraft(prompt);
  render();
  requestAnimationFrame(() => {
    const textarea = document.querySelector('.composer textarea');
    textarea?.focus();
    textarea?.setSelectionRange(prompt.length, prompt.length);
  });
}

function renderMain() {
  const empty = state.messages.length === 0;
  const welcome = empty
    ? el('section', { class: 'welcome' }, [
        el('span', { class: 'brand-mark', text: 'm' }),
        el('h1', { text: '今天想聊些什么？' }),
        el('p', { text: '选择 Account 连接和模型，开始一段安全、可同步的对话。' }),
        ...(state.connection
          ? [
              el(
                'div',
                { class: 'prompt-grid', 'aria-label': '示例提示' },
                examplePrompts.map((prompt) =>
                  el('button', {
                    class: 'prompt-chip',
                    text: prompt,
                    onclick: () => fillExample(prompt),
                  }),
                ),
              ),
            ]
          : [
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
                    setError(error);
                  }
                  render();
                },
              }),
            ]),
      ])
    : null;
  const messages = el(
    'div',
    { class: 'messages', id: 'messages', 'aria-live': 'polite' },
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
      if (event.isComposing) return;
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage(event.target.value);
      }
    },
  });
  textarea.value = state.draft;
  const send = el('button', {
    class: `send${state.busy ? ' stop' : ''}`,
    text: state.busy ? '■' : '↑',
    title: state.busy ? '停止生成' : '发送',
    'aria-label': state.busy ? '停止生成' : '发送消息',
    disabled: !state.busy && (!state.connection || !state.model || !state.draft.trim()),
    onclick: () => {
      if (state.busy) cancelGeneration();
      else sendMessage(textarea.value);
    },
  });
  textarea.addEventListener('input', () => {
    saveDraft(textarea.value);
    send.disabled = !textarea.value.trim() || !state.connection || !state.model;
  });
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
      text: 'AI 回复可能不准确。Enter 发送，Shift+Enter 换行；发送前会显示本次授权摘要。',
    }),
    ...(state.error
      ? [
          el('div', { class: 'notice error', role: 'alert' }, [
            el('span', { text: state.error }),
            ...(state.accountAction
              ? [
                  el('a', {
                    href: `https://account.meoarch.org${state.accountAction}`,
                    text: ' 前往 Meo Account',
                    target: '_blank',
                    rel: 'noopener noreferrer',
                  }),
                ]
              : []),
          ]),
        ]
      : []),
    ...(state.notice ? [el('div', { class: 'notice', role: 'status', text: state.notice })] : []),
  ]);
  return el('main', { class: 'main' }, [renderTopbar(), scroll, composer]);
}

function closeMobileMenu() {
  if (!state.mobileMenu) return;
  state.mobileMenu = false;
  render();
  requestAnimationFrame(() => document.querySelector('.menu-toggle')?.focus());
}

function render() {
  const shellChildren = [renderSidebar(), renderMain()];
  if (state.mobileMenu) {
    shellChildren.push(
      el('button', {
        class: 'sidebar-backdrop',
        'aria-label': '关闭侧栏',
        onclick: closeMobileMenu,
      }),
    );
  }
  const shell = el('div', { class: `shell${state.mobileMenu ? ' menu-open' : ''}` }, shellChildren);
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
          el('p', { text: friendlyError(error) }),
          el('button', { class: 'button primary', text: '重试', onclick: boot }),
        ]),
      ]),
    );
  }
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.mobileMenu) closeMobileMenu();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    document.querySelector('.composer textarea')?.focus();
  }
});

boot();
