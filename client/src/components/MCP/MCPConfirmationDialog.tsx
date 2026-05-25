import React, { useEffect, useRef, useState } from 'react';
import { useRecoilState } from 'recoil';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogFooter,
  OGDialogHeader,
  OGDialogTitle,
} from '@librechat/client';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import {
  pendingMCPConfirmationsAtom,
  type MCPConfirmationPresentation,
  type PresentationField,
} from '~/store/mcpConfirmation';

type Decision = 'accept' | 'cancel';

type ParsedPreview =
  | { type: 'parsed'; args: Array<{ key: string; value: unknown }> }
  | { type: 'raw'; text: string };

/**
 * The gateway emits previews in the shape:
 *
 *   Tool: send-chat-message
 *     chatId: "19:..."
 *     body: {"content":"hello"}
 *
 * Each arg line is two-space-indented `<key>: <jsonValue>`. We split on
 * newlines, drop the `Tool:` line (the tool name already lives in the title),
 * and JSON-parse each value so the UI can pretty-print objects instead of
 * showing them as one-line stringified blobs. If anything looks off we fall
 * back to the raw preview text rather than dropping information.
 */
function parsePreview(preview: string): ParsedPreview {
  const lines = preview.split('\n');
  if (lines.length === 0 || !/^\s*Tool:/.test(lines[0])) {
    return { type: 'raw', text: preview };
  }
  const args: Array<{ key: string; value: unknown }> = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const match = line.match(/^\s+([^:]+):\s*(.*)$/);
    if (!match) return { type: 'raw', text: preview };
    const key = match[1].trim();
    const rawValue = match[2];
    let value: unknown;
    try {
      value = JSON.parse(rawValue);
    } catch {
      value = rawValue;
    }
    args.push({ key, value });
  }
  return { type: 'parsed', args };
}

function isComplexValue(v: unknown): boolean {
  return v !== null && typeof v === 'object';
}

function formatValue(v: unknown): string {
  if (typeof v === 'string') return v;
  return JSON.stringify(v, null, 2);
}

/**
 * Render a single presentation field. The gateway's `format` hint drives
 * styling: free `text` is rendered relaxed/wrappable, `code` and identifiers
 * use mono inline, `json` and `markdown` get a fenced block. The hint is
 * advisory — we still defensively `<pre>`-wrap any object value regardless of
 * format since rendering an object inline would just print [object Object].
 */
function PresentationFieldRow({ field }: { field: PresentationField }) {
  const { label, value, format } = field;
  const complex = isComplexValue(value);
  // Markdown branch only takes string values; non-strings fall through to the
  // <pre> block for safety (e.g. a malformed object slipped in with format=markdown).
  const isMarkdown = format === 'markdown' && typeof value === 'string';
  const useBlock = complex || format === 'json' || (format === 'markdown' && !isMarkdown);

  return (
    <div className="px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</dt>
      <dd className="mt-1">
        {/* eslint-disable no-nested-ternary */}
        {isMarkdown ? (
          <div className="max-w-none break-words text-text-primary">
            <MarkdownLite content={value as string} codeExecution={false} />
          </div>
        ) : useBlock ? (
          <pre className="overflow-auto whitespace-pre-wrap break-all rounded bg-surface-primary p-2 font-mono text-xs text-text-primary">
            {formatValue(value)}
          </pre>
        ) : format === 'code' ? (
          <code className="block break-all font-mono text-xs text-text-primary">
            {formatValue(value)}
          </code>
        ) : (
          <span className="block break-words text-sm text-text-primary">{formatValue(value)}</span>
        )}
        {/* eslint-enable no-nested-ternary */}
      </dd>
    </div>
  );
}

/**
 * Render a structured presentation. Primary fields are always visible;
 * any `detail` fields collapse under a "Show details" toggle so the modal
 * surfaces the at-a-glance summary first.
 */
function PresentationView({ presentation }: { presentation: MCPConfirmationPresentation }) {
  const localize = useLocalize();
  const [showDetails, setShowDetails] = React.useState(true);
  const primary = presentation.fields.filter((f) => f.importance !== 'detail');
  const details = presentation.fields.filter((f) => f.importance === 'detail');

  return (
    <div>
      <dl className="divide-y divide-border-medium overflow-hidden rounded-md border border-border-medium bg-surface-secondary">
        {primary.map((f, i) => (
          <PresentationFieldRow key={`p-${i}`} field={f} />
        ))}
        {showDetails && details.map((f, i) => <PresentationFieldRow key={`d-${i}`} field={f} />)}
      </dl>
      {details.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails((v) => !v)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"
        >
          {showDetails ? (
            <ChevronUp aria-hidden="true" className="size-4" />
          ) : (
            <ChevronDown aria-hidden="true" className="size-4" />
          )}
          {showDetails
            ? localize('com_ui_mcp_confirm_hide_details')
            : localize('com_ui_mcp_confirm_show_details', { count: details.length })}
        </Button>
      )}
    </div>
  );
}

async function postDecision(
  confirmationId: string,
  decision: Decision,
  token: string | null | undefined,
): Promise<void> {
  await fetch(`/api/mcp/confirm/${encodeURIComponent(confirmationId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ decision }),
  });
}

export default function MCPConfirmationDialog() {
  const [queue, setQueue] = useRecoilState(pendingMCPConfirmationsAtom);
  const head = queue[0];
  const { token } = useAuthContext();
  const localize = useLocalize();
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState<number>(0);

  // Track the confirmationId we last auto-canceled so we don't double-post
  // when the timer fires multiple times for the same head before pop happens.
  const autoCanceledRef = useRef<string | null>(null);

  // Mirror `submitting` in a ref so the timer's tick() can read the current
  // value without depending on it (which would otherwise re-arm the interval
  // on every flip, including the one inside handleDecision's finally clause).
  // Without this, the timer can race against an in-flight Approve at the
  // deadline boundary and double-pop the queue — silently dropping entry B
  // when the user approves entry A at second 119.5.
  const submittingRef = useRef(false);
  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  // Pop the head off the queue. The next item (if any) becomes the new head
  // and the dialog re-renders against it; the countdown effect re-arms via
  // its dependency on head.confirmationId.
  const popHead = () => {
    setQueue((prev) => prev.slice(1));
  };

  useEffect(() => {
    if (!head) {
      setRemaining(0);
      return;
    }
    autoCanceledRef.current = null;

    const tick = () => {
      const ms = head.deadline - Date.now();
      setRemaining(Math.max(0, Math.ceil(ms / 1000)));
      // Skip auto-cancel while a user-initiated decision is in flight —
      // the in-flight handleDecision will pop the head when it resolves,
      // and firing a competing 'cancel' here would both double-pop the
      // queue (silently dropping the next entry) and send a contradictory
      // wire decision.
      if (ms <= 0 && !submittingRef.current) {
        if (autoCanceledRef.current !== head.confirmationId) {
          autoCanceledRef.current = head.confirmationId;
          void postDecision(head.confirmationId, 'cancel', token).catch(() => {
            // Server may have already resolved via its own TTL — fine.
          });
          popHead();
        }
      }
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
    // We intentionally key off head.confirmationId so the effect re-arms
    // whenever the head changes (i.e. the previous head was popped).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [head?.confirmationId]);

  if (!head) return null;

  const handleDecision = async (decision: Decision) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await postDecision(head.confirmationId, decision, token);
    } catch (err) {
      // Network error — the server's TTL will eventually resolve as timeout.
      // Surface to console so a developer sees it; don't block the UI.
      console.error('Failed to submit MCP confirmation decision', err);
    } finally {
      setSubmitting(false);
      popHead();
    }
  };

  return (
    <OGDialog
      open={true}
      onOpenChange={(open) => {
        // Treat dismissal as cancel so the agent loop can resume.
        if (!open && !submitting) {
          void handleDecision('cancel');
        }
      }}
    >
      <OGDialogContent
        data-testid="dialog-root"
        className="flex max-h-[85vh] w-11/12 max-w-2xl flex-col overflow-hidden p-0"
      >
        <OGDialogHeader
          data-testid="dialog-header"
          className="my-0 flex-shrink-0 border-b border-border-light px-6 py-4"
        >
          <OGDialogTitle>
            {head.presentation?.title ??
              localize('com_ui_mcp_confirm_action', { toolName: head.toolName })}
            <span className="ml-2 text-sm font-normal text-text-secondary">
              ({head.serverName})
            </span>
            {queue.length > 1 && (
              <span className="ml-2 rounded bg-surface-tertiary px-2 py-0.5 text-xs font-normal text-text-secondary">
                {localize('com_ui_mcp_confirm_pending_badge', {
                  position: 1,
                  total: queue.length,
                })}
              </span>
            )}
          </OGDialogTitle>
          {head.presentation?.summary && (
            <p className="mt-1 text-sm text-text-secondary">{head.presentation.summary}</p>
          )}
        </OGDialogHeader>

        <div data-testid="dialog-body" className="my-0 flex-1 overflow-y-auto px-6 py-0">
          <p className="mb-3 text-sm text-text-secondary">
            {localize('com_ui_mcp_confirm_prompt')}
          </p>
          {head.presentation ? (
            <PresentationView presentation={head.presentation} />
          ) : (
            (() => {
              const parsed = parsePreview(head.preview);
              if (parsed.type === 'raw') {
                return (
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border-medium bg-surface-secondary p-3 text-sm text-text-primary">
                    {parsed.text}
                  </pre>
                );
              }
              if (parsed.args.length === 0) {
                return (
                  <p className="text-sm italic text-text-secondary">
                    {localize('com_ui_mcp_confirm_no_arguments')}
                  </p>
                );
              }
              return (
                <dl className="max-h-80 divide-y divide-border-medium overflow-auto rounded-md border border-border-medium bg-surface-secondary">
                  {parsed.args.map(({ key, value }) => (
                    <div key={key} className="px-3 py-2">
                      <dt className="font-mono text-xs font-semibold text-text-secondary">{key}</dt>
                      <dd className="mt-1">
                        {isComplexValue(value) ? (
                          <pre className="overflow-auto whitespace-pre-wrap break-all rounded bg-surface-primary p-2 font-mono text-xs text-text-primary">
                            {formatValue(value)}
                          </pre>
                        ) : (
                          <code className="block break-all font-mono text-xs text-text-primary">
                            {formatValue(value)}
                          </code>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              );
            })()
          )}
        </div>

        <OGDialogFooter
          data-testid="dialog-footer"
          className="flex flex-shrink-0 items-center border-t border-border-light px-6 py-3"
        >
          <p className="mr-auto text-xs text-text-secondary">
            {localize('com_ui_mcp_confirm_auto_cancel', { seconds: remaining })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void handleDecision('cancel')}
              disabled={submitting}
            >
              {localize('com_ui_mcp_confirm_button_cancel')}
            </Button>
            <Button
              variant="submit"
              onClick={() => void handleDecision('accept')}
              disabled={submitting}
            >
              {localize('com_ui_mcp_confirm_button_accept')}
            </Button>
          </div>
        </OGDialogFooter>
      </OGDialogContent>
    </OGDialog>
  );
}
