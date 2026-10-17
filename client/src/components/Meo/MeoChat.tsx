import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import remarkGfm from 'remark-gfm';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type { MeoConsent } from './MeoConsentDialog';
import MeoConsentDialog from './MeoConsentDialog';
import { useMeoSession } from './session';

type Connection = {
  id: string;
  provider: string;
  displayName: string;
  defaultModel: string;
  secretHint: string;
};
type Model = { id: string; name: string; description?: string };
type Message = { role: 'user' | 'assistant'; content: string };
type Conversation = { id: string; title: string; createdAt: string; updatedAt: string };
type ApiConversation = {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  created_at?: string;
  updated_at?: string;
};
type ApiMessage = {
  role?: string;
  text?: string;
  content?: unknown;
};

function normalizeConversation(value: ApiConversation): Conversation {
  return {
    id: value.id,
    title: value.title ?? '',
    createdAt: value.createdAt ?? value.created_at ?? '',
    updatedAt: value.updatedAt ?? value.updated_at ?? '',
  };
}

function messageText(value: ApiMessage): string {
  if (typeof value.text === 'string') return value.text;
  if (typeof value.content === 'string') return value.content;
  if (!Array.isArray(value.content)) return '';
  return value.content
    .flatMap((part) => {
      if (!part || typeof part !== 'object' || Array.isArray(part)) return [];
      const block = part as Record<string, unknown>;
      return block.type === 'text' && typeof block.text === 'string' ? [block.text] : [];
    })
    .join('\n');
}

function requestError(value: unknown, status: number): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.error === 'string') return record.error;
    if (record.error && typeof record.error === 'object' && !Array.isArray(record.error)) {
      const nested = record.error as Record<string, unknown>;
      if (typeof nested.message === 'string') return nested.message;
      if (typeof nested.code === 'string') return nested.code;
    }
  }
  return `Request failed (${status})`;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers,
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(requestError(value, response.status));
  return value as T;
}

export default function MeoChat() {
  const { t } = useTranslation();
  const { user } = useMeoSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedConnection = searchParams.get('connection') ?? '';
  const requestedModel = searchParams.get('model') ?? '';
  const selectedConversationKey = `meo-ai-web:selected:${user?.id ?? 'anonymous'}`;
  const [history, setHistory] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [credentialId, setCredentialId] = useState(requestedConnection);
  const [model, setModel] = useState(requestedModel);
  const modelRef = useRef(model);
  modelRef.current = model;
  const [models, setModels] = useState<Model[]>([]);
  const [modelDiscovery, setModelDiscovery] = useState<'idle' | 'unsupported' | 'ready'>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingConsent, setPendingConsent] = useState<MeoConsent | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const historyGenerationRef = useRef(0);
  const skipHistoryLoadRef = useRef('');
  const consentDecisionRef = useRef<((approved: boolean) => void) | null>(null);

  useEffect(
    () => () => {
      streamAbortRef.current?.abort();
      consentDecisionRef.current?.(false);
    },
    [user?.id],
  );

  const requestConsent = (consent: MeoConsent) =>
    new Promise<boolean>((resolve) => {
      consentDecisionRef.current = resolve;
      setPendingConsent(consent);
    });

  const resolveConsent = (approved: boolean) => {
    const resolve = consentDecisionRef.current;
    consentDecisionRef.current = null;
    setPendingConsent(null);
    resolve?.(approved);
  };

  const updateDeepLink = useCallback(
    (connection: string, selectedModel: string) => {
      const next = new URLSearchParams();
      if (connection) next.set('connection', connection);
      if (selectedModel) next.set('model', selectedModel);
      setSearchParams(next, { replace: true });
    },
    [setSearchParams],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    json<{ credentials: Connection[] }>('/api/meo/connections')
      .then(({ credentials: result }) => {
        if (!active) return;
        setConnections(result);
        const requested = result.find((item) => item.id === requestedConnection);
        const selected = requested ?? result[0];
        if (!selected) {
          setCredentialId('');
          setModel('');
          return;
        }
        setCredentialId(selected.id);
        if (!requested && requestedConnection) {
          setError(t('meo_web_invalid_connection_fallback'));
          setModel(selected.defaultModel);
          updateDeepLink(selected.id, selected.defaultModel);
        } else if (!requestedModel) {
          setModel(selected.defaultModel);
        }
      })
      .catch((reason: Error) => active && setError(reason.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [requestedConnection, requestedModel, t, updateDeepLink]);

  useEffect(() => {
    let active = true;
    historyGenerationRef.current += 1;
    setLoadingMore(false);
    setHistoryLoading(true);
    json<{ conversations: ApiConversation[]; nextCursor: string | null }>('/api/meo/conversations')
      .then(({ conversations: result, nextCursor }) => {
        if (!active) return;
        const normalized = result.map(normalizeConversation);
        setHistory(normalized);
        setHistoryCursor(nextCursor);
        const savedId = localStorage.getItem(selectedConversationKey) ?? '';
        const initial = normalized.find((item) => item.id === savedId) ?? normalized[0];
        setActiveConversationId(initial?.id ?? '');
      })
      .catch((reason: Error) => active && setError(reason.message))
      .finally(() => active && setHistoryLoading(false));
    return () => {
      active = false;
    };
  }, [selectedConversationKey]);

  useEffect(() => {
    if (!credentialId) {
      setModels([]);
      setModelDiscovery('idle');
      return;
    }
    let active = true;
    setModelDiscovery('idle');
    json<{ supported: boolean; models: Model[] }>(
      `/api/meo/connections/${encodeURIComponent(credentialId)}/models`,
    )
      .then((result) => {
        if (!active) return;
        setModels(result.models);
        setModelDiscovery(result.supported ? 'ready' : 'unsupported');
        if (result.supported && result.models.length > 0) {
          const found = result.models.find((item) => item.id === modelRef.current);
          const fallback =
            result.models.find(
              (item) => item.id === connections.find((c) => c.id === credentialId)?.defaultModel,
            ) ?? result.models[0];
          if (!found) {
            if (requestedModel) setError(t('meo_web_invalid_model_fallback'));
            setModel(fallback.id);
            updateDeepLink(credentialId, fallback.id);
          }
        } else if (!modelRef.current) {
          setModel(connections.find((item) => item.id === credentialId)?.defaultModel ?? '');
        }
      })
      .catch((reason: Error) => active && setError(reason.message));
    return () => {
      active = false;
    };
  }, [connections, credentialId, requestedModel, t, updateDeepLink]);

  useEffect(() => {
    let active = true;
    if (!activeConversationId) {
      setMessages([]);
      return () => {
        active = false;
      };
    }
    localStorage.setItem(selectedConversationKey, activeConversationId);
    if (skipHistoryLoadRef.current === activeConversationId) {
      skipHistoryLoadRef.current = '';
      return;
    }
    setMessages([]);
    json<{ messages: ApiMessage[] }>(
      `/api/meo/conversations/${encodeURIComponent(activeConversationId)}/messages`,
    )
      .then(({ messages: result }) => {
        if (!active) return;
        setMessages(
          result.flatMap((message) =>
            message.role === 'user' || message.role === 'assistant'
              ? [{ role: message.role, content: messageText(message) }]
              : [],
          ),
        );
      })
      .catch((reason: Error) => active && setError(reason.message));
    return () => {
      active = false;
    };
  }, [activeConversationId, selectedConversationKey]);

  const selected = useMemo(
    () => connections.find((item) => item.id === credentialId),
    [connections, credentialId],
  );

  const changeConnection = useCallback(
    (id: string) => {
      const nextModel = connections.find((item) => item.id === id)?.defaultModel ?? '';
      setCredentialId(id);
      setModel(nextModel);
      updateDeepLink(id, nextModel);
    },
    [connections, updateDeepLink],
  );

  const changeModel = (value: string) => {
    setModel(value);
    updateDeepLink(credentialId, value);
  };

  const startNewChat = () => {
    if (busy) return;
    setActiveConversationId('');
    setMessages([]);
    setDraft('');
    localStorage.removeItem(selectedConversationKey);
  };

  const openConversation = (conversation: Conversation) => {
    if (busy) return;
    setError('');
    setActiveConversationId(conversation.id);
  };

  const loadMoreHistory = async () => {
    if (!historyCursor || loadingMore || busy) return;
    const generation = historyGenerationRef.current;
    setLoadingMore(true);
    try {
      const page = await json<{ conversations: ApiConversation[]; nextCursor: string | null }>(
        `/api/meo/conversations?cursor=${encodeURIComponent(historyCursor)}`,
      );
      if (generation !== historyGenerationRef.current) return;
      const normalized = page.conversations.map(normalizeConversation);
      setHistory((current) => {
        const existing = new Set(current.map((item) => item.id));
        return [...current, ...normalized.filter((item) => !existing.has(item.id))];
      });
      setHistoryCursor(page.nextCursor);
    } catch (reason) {
      if (generation === historyGenerationRef.current)
        setError(reason instanceof Error ? reason.message : t('meo_web_chat_failed'));
    } finally {
      if (generation === historyGenerationRef.current) setLoadingMore(false);
    }
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || busy || !credentialId || !model.trim()) return;
    setError('');
    setBusy(true);
    const nextMessages: Message[] = [...messages, { role: 'user', content: prompt }];
    try {
      const prepared = await json<{ consent: MeoConsent }>('/api/chat/prepare', {
        method: 'POST',
        body: JSON.stringify({
          credentialId,
          model: model.trim(),
          messages: nextMessages,
        }),
      });
      const consent = prepared.consent;
      const approved = await requestConsent(consent);
      if (!approved) return;

      const abortController = new AbortController();
      streamAbortRef.current = abortController;
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          credentialId,
          model: model.trim(),
          messages: nextMessages,
          consent,
        }),
        signal: abortController.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(requestError(body, response.status));
      }

      let conversationId = activeConversationId;
      if (!conversationId) {
        const created = await json<{ conversation: ApiConversation }>('/api/meo/conversations', {
          method: 'POST',
          body: JSON.stringify({ title: prompt.slice(0, 80) }),
        });
        const normalized = normalizeConversation(created.conversation);
        conversationId = normalized.id;
        skipHistoryLoadRef.current = conversationId;
        setHistory((current) => [normalized, ...current]);
        setActiveConversationId(conversationId);
      }

      await json(`/api/meo/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ role: 'user', content: prompt }),
      });
      setMessages(nextMessages);
      setDraft('');
      setMessages((current) => [...current, { role: 'assistant', content: '' }]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';
      let completed = false;
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const eventName = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
          const data = block.match(/^data:\s*(.+)$/m)?.[1];
          if (eventName === 'delta' && data) {
            const chunk = JSON.parse(data).text as string;
            assistantText += chunk;
            setMessages((current) =>
              current.map((message, index) =>
                index === current.length - 1 && message.role === 'assistant'
                  ? { ...message, content: message.content + chunk }
                  : message,
              ),
            );
          } else if (eventName === 'error' && data) {
            const failure = JSON.parse(data) as { message?: string };
            throw new Error(failure.message ?? t('meo_web_stream_failed'));
          } else if (eventName === 'done') {
            completed = true;
          }
          boundary = buffer.indexOf('\n\n');
        }
        if (done) break;
      }
      if (!completed) throw new Error(t('meo_web_stream_incomplete'));
      if (assistantText) {
        await json(`/api/meo/conversations/${encodeURIComponent(conversationId)}/messages`, {
          method: 'POST',
          body: JSON.stringify({ role: 'assistant', content: assistantText }),
        });
      }
      setHistory((current) => {
        const item = current.find((conversation) => conversation.id === conversationId);
        if (!item) return current;
        return [
          { ...item, updatedAt: new Date().toISOString() },
          ...current.filter((conversation) => conversation.id !== conversationId),
        ];
      });
    } catch (reason) {
      streamAbortRef.current?.abort();
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
        setError(reason instanceof Error ? reason.message : t('meo_web_chat_failed'));
      }
    } finally {
      streamAbortRef.current = null;
      setBusy(false);
    }
  }

  return (
    <main className="!text-text-primary mx-auto flex h-full w-full max-w-5xl flex-col gap-4 px-4 py-5 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('meo_web_title')}</h1>
          <p className="text-text-secondary text-sm">{t('meo_web_account_control')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-lg border px-3 py-2"
            type="button"
            onClick={startNewChat}
            disabled={busy}
          >
            {t('meo_web_new_chat')}
          </button>
          <select
            aria-label={t('meo_web_connection')}
            className="bg-surface-primary min-w-44 rounded-lg border px-3 py-2"
            value={credentialId}
            onChange={(event) => changeConnection(event.target.value)}
            disabled={loading || busy}
          >
            <option value="">{t('meo_web_choose_connection')}</option>
            {connections.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName} · {item.provider}
              </option>
            ))}
          </select>
          {models.length > 0 && modelDiscovery === 'ready' ? (
            <select
              aria-label={t('meo_web_model')}
              className="bg-surface-primary min-w-40 rounded-lg border px-3 py-2"
              value={model}
              onChange={(event) => changeModel(event.target.value)}
              disabled={busy}
            >
              {models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              aria-label={t('meo_web_model_id')}
              className="bg-surface-primary min-w-40 rounded-lg border px-3 py-2"
              value={model}
              onChange={(event) => changeModel(event.target.value)}
              disabled={busy}
              placeholder={t('meo_web_model_id')}
            />
          )}
        </div>
      </header>
      {modelDiscovery === 'unsupported' && (
        <p className="text-text-secondary text-sm">{t('meo_web_model_manual_fallback')}</p>
      )}
      {selected && (
        <p className="text-text-secondary text-xs">
          {t('meo_web_key_hint', { hint: selected.secretHint })}
        </p>
      )}
      {(history.length > 0 || historyCursor) && (
        <nav aria-label={t('meo_web_history')} className="flex gap-2 overflow-x-auto pb-1">
          {history.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className={`max-w-56 truncate rounded-full border px-3 py-1.5 text-sm ${conversation.id === activeConversationId ? 'bg-surface-secondary' : ''}`}
              onClick={() => openConversation(conversation)}
              disabled={busy}
            >
              {conversation.title || t('meo_web_untitled_chat')}
            </button>
          ))}
          {historyCursor && (
            <button
              type="button"
              className="shrink-0 rounded-full border px-3 py-1.5 text-sm"
              onClick={loadMoreHistory}
              disabled={busy || loadingMore}
            >
              {loadingMore ? t('meo_web_loading_more') : t('meo_web_load_more')}
            </button>
          )}
        </nav>
      )}
      <section
        aria-label={t('meo_web_conversation')}
        className="bg-surface-primary min-h-0 flex-1 space-y-5 overflow-y-auto rounded-xl border p-4 md:p-6"
      >
        {(loading || historyLoading) && <p>{t('meo_web_loading')}</p>}
        {!loading && connections.length === 0 && <p>{t('meo_web_no_connections')}</p>}
        {messages.map((message, index) => (
          <article
            key={`${index}-${message.role}`}
            className={
              message.role === 'user'
                ? 'bg-surface-secondary ml-auto max-w-[85%] rounded-2xl p-4'
                : 'prose prose-sm max-w-none'
            }
          >
            {message.role === 'assistant' ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            ) : (
              <p className="whitespace-pre-wrap">{message.content}</p>
            )}
          </article>
        ))}
        {error && (
          <p role="alert" className="text-status-error-strong text-sm">
            {error}
          </p>
        )}
      </section>
      {pendingConsent && <MeoConsentDialog consent={pendingConsent} onResolve={resolveConsent} />}
      <form
        onSubmit={submit}
        className="bg-surface-primary flex items-end gap-3 rounded-xl border p-3"
      >
        <textarea
          className="max-h-48 min-h-14 flex-1 resize-y bg-transparent p-2 outline-none"
          value={draft}
          maxLength={35000}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('meo_web_message_placeholder')}
          aria-label={t('meo_web_message')}
          disabled={busy || !selected}
        />
        <button
          className="bg-surface-primary rounded-lg px-4 py-2 font-medium shadow"
          type="submit"
          disabled={busy || !draft.trim() || !selected || !model.trim()}
        >
          {busy ? t('meo_web_thinking') : t('meo_web_send')}
        </button>
      </form>
    </main>
  );
}
