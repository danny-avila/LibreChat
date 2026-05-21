import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuthContext } from '~/hooks/AuthContext';
import { cn } from '~/utils';

type Msg = { role: 'user' | 'assistant'; content: string };

function AssistantIcon() {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 text-xs font-bold">
      AI
    </span>
  );
}

export default function WorkflowChatPanel() {
  const { token } = useAuthContext();
  const { runId } = useParams<{ id?: string; runId?: string }>();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runContext, setRunContext] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load run context when on a run page
  useEffect(() => {
    if (!runId || !token) { setRunContext(null); return; }
    fetch(`/api/aivion/workflow/runs/${runId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((run) => {
        if (!run) return;
        const parts: string[] = [];
        if (run.inputs?.role_title) parts.push(`Role: ${run.inputs.role_title}`);
        if (run.inputs?.required_skills) parts.push(`Required skills: ${run.inputs.required_skills}`);
        if (run.inputs?.experience_level) parts.push(`Experience level: ${run.inputs.experience_level}`);
        const roFields: Record<string, string> = {};
        for (const f of run.pending_input_schema?.fields ?? []) {
          if (f.type === 'readonly' && f.default) roFields[f.name] = String(f.default);
        }
        if (roFields['_name']) parts.push(`Candidate: ${roFields['_name']}`);
        if (roFields['_score']) parts.push(`Fit score: ${roFields['_score']}/10`);
        if (roFields['_summary']) parts.push(`Summary: ${roFields['_summary']}`);
        if (roFields['_ai_rec']) parts.push(`AI recommendation: ${roFields['_ai_rec']}`);
        setRunContext(parts.join('\n') || null);
      })
      .catch(() => null);
  }, [runId, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: Msg = { role: 'user', content: text };
    setMsgs((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/aivion/workflow/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: [...msgs, userMsg].map((m) => ({ role: m.role, content: m.content })),
          context: runContext ?? undefined,
          runId: runId ?? undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const { reply } = await res.json();
      setMsgs((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }, [input, loading, msgs, token, runContext]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  }

  const isEmpty = msgs.length === 0;

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-border-light bg-surface-primary-alt">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border-light px-4 py-3">
        <AssistantIcon />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary leading-tight">AI Chat</p>
          {runContext && (
            <p className="truncate text-[10px] text-text-secondary">Has workflow context</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {isEmpty && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <AssistantIcon />
            <div>
              <p className="text-sm font-medium text-text-primary">Ask anything</p>
              <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                {runContext
                  ? 'I can see this run\'s context. Ask me about the candidate, fit score, or what to do next.'
                  : 'Ask about workflows, candidates, or HR best practices.'}
              </p>
            </div>
            {runContext && (
              <div className="w-full rounded-lg border border-border-light bg-surface-secondary p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary mb-1">Run context</p>
                <p className="text-xs text-text-secondary whitespace-pre-line">{runContext}</p>
              </div>
            )}
          </div>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={cn(
              'mb-3 flex gap-2',
              m.role === 'user' ? 'flex-row-reverse' : 'flex-row',
            )}
          >
            {m.role === 'assistant' && <AssistantIcon />}
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
                m.role === 'user'
                  ? 'rounded-tr-sm bg-blue-600 text-white'
                  : 'rounded-tl-sm bg-surface-secondary text-text-primary',
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="mb-3 flex gap-2">
            <AssistantIcon />
            <div className="rounded-2xl rounded-tl-sm bg-surface-secondary px-3 py-2">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-text-secondary animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}
        {error && (
          <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border-light p-3">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask AI… (⌘↵ to send)"
            className="flex-1 resize-none rounded-xl border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          />
          <button
            type="button"
            onClick={send}
            disabled={!input.trim() || loading}
            className="flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-xl bg-amber-500 text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M22 2L15 22 11 13 2 9l20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
