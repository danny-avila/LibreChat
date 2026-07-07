import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import copy from 'copy-to-clipboard';
import { useRecoilValue } from 'recoil';
import { ArrowDown, Users, X } from 'lucide-react';
import { Button, useMediaQuery } from '@librechat/client';
import { ContentTypes, EModelEndpoint } from 'librechat-data-provider';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';
import {
  useSubagentRunView,
  PANEL_AT_BOTTOM_THRESHOLD_PX,
} from '~/components/Chat/Messages/Content/Parts/subagentShared';
import {
  SubagentBody,
  SubagentPrompt,
} from '~/components/Chat/Messages/Content/Parts/SubagentBody';
import { AttachmentGroup } from '~/components/Chat/Messages/Content/Parts';
import CopyButton from '~/components/Messages/Content/CopyButton';
import useOpenRightPanel from '~/hooks/useOpenRightPanel';
import MessageIcon from '~/components/Share/MessageIcon';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

/** Concatenated final text of a run, used for the header copy action. */
function runCopyText(contentParts: TMessageContentParts[], output?: string | null): string {
  const text = contentParts
    .filter((p) => p.type === ContentTypes.TEXT)
    .map((p) => (p as { text?: string }).text ?? '')
    .join('\n\n')
    .trim();
  return text || (output ?? '');
}

/**
 * Right-side panel that renders a subagent run in the artifacts-style slot.
 * Only mounted by `Presentation` while `currentSubagentRunId != null`, so it
 * reads the focused id directly rather than through a provider.
 */
export default function SubagentPanel(): JSX.Element | null {
  const localize = useLocalize();
  const runId = useRecoilValue(store.currentSubagentRunId);
  const { closeSubagentRun } = useOpenRightPanel();
  /** Must match `SidePanelGroup`'s breakpoint: only at ≤767px does it wrap the
   *  panel in the fixed inset-0 overlay this mobile transition assumes. A wider
   *  query would run the bottom slide-up inside the side-by-side desktop column. */
  const isMobile = useMediaQuery('(max-width: 767px)');

  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const delay = isMobile ? 50 : 30;
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => {
      clearTimeout(timer);
      setIsMounted(false);
    };
  }, [isMobile]);

  const view = useSubagentRunView(runId ?? '');

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distance <= PANEL_AT_BOTTOM_THRESHOLD_PX);
  }, []);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const contentEl = contentRef.current;
    if (!scrollEl || !contentEl || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (!isAtBottom) return;
      scrollEl.scrollTop = scrollEl.scrollHeight;
    });
    observer.observe(contentEl);
    return () => observer.disconnect();
  }, [isAtBottom]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setIsAtBottom(true);
  }, []);

  const copyText = useMemo(
    () => runCopyText(view.contentParts, view.output),
    [view.contentParts, view.output],
  );
  const handleCopy = useCallback(() => {
    if (!copyText) return;
    copy(copyText, { format: 'text/plain' });
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 3000);
  }, [copyText]);

  const { subagentAgent, isSelfSpawn, subagentType, running, cancelled, hasError } = view;
  const title = subagentAgent?.name || (isSelfSpawn ? localize('com_ui_agent') : subagentType);

  const subtitle = useMemo(() => {
    const toolCount = view.contentParts.filter((p) => p.type === ContentTypes.TOOL_CALL).length;
    const thoughtCount = view.contentParts.filter((p) => p.type === ContentTypes.THINK).length;
    const parts: string[] = [];
    if (subagentAgent?.name && !isSelfSpawn) parts.push(subagentType);
    if (toolCount > 0) parts.push(localize('com_ui_subagent_tool_count', { 0: String(toolCount) }));
    if (thoughtCount > 0)
      parts.push(localize('com_ui_subagent_thought_count', { 0: String(thoughtCount) }));
    return parts.join(' · ');
  }, [view.contentParts, subagentAgent?.name, isSelfSpawn, subagentType, localize]);

  const status = useMemo(() => {
    if (hasError)
      return { label: localize('com_ui_subagent_status_failed'), tone: 'error' as const };
    if (cancelled)
      return { label: localize('com_ui_subagent_status_stopped'), tone: 'muted' as const };
    if (running)
      return { label: localize('com_ui_subagent_status_running'), tone: 'live' as const };
    return { label: localize('com_ui_subagent_status_done'), tone: 'done' as const };
  }, [hasError, cancelled, running, localize]);

  if (!runId || !isMounted) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col overflow-hidden bg-surface-primary-alt text-text-primary',
        isMobile
          ? cn(
              'transition-all duration-300',
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0',
            )
          : cn(
              'shadow-2xl',
              isVisible
                ? 'translate-x-0 opacity-100 transition-all duration-300'
                : 'translate-x-5 opacity-0 transition-all duration-300',
            ),
      )}
    >
      {/* Header */}
      <div className="flex h-[52px] flex-shrink-0 items-center justify-between gap-2 border-b border-border-light bg-surface-primary-alt px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-text-secondary">
            {subagentAgent ? (
              <MessageIcon
                message={{ endpoint: EModelEndpoint.agents, isCreatedByUser: false } as TMessage}
                agent={subagentAgent}
              />
            ) : (
              <Users size={15} aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-text-primary" title={title}>
              {title}
            </div>
            {subtitle && <div className="truncate text-xs text-text-secondary">{subtitle}</div>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
              status.tone === 'error' && 'bg-surface-secondary text-text-warning',
              status.tone === 'muted' && 'bg-surface-secondary text-text-secondary',
              status.tone === 'live' && 'bg-surface-secondary text-primary',
              status.tone === 'done' && 'bg-surface-secondary text-text-secondary',
            )}
          >
            {status.tone === 'live' && (
              <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
            )}
            {status.label}
          </span>
          {copyText && (
            <CopyButton
              isCopied={isCopied}
              iconOnly
              onClick={handleCopy}
              label={localize('com_ui_copy_to_clipboard')}
              copiedLabel={localize('com_ui_copied_to_clipboard')}
            />
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            onClick={closeSubagentRun}
            aria-label={localize('com_ui_close')}
          >
            <X size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Prompt — pinned "Task" disclosure directly under the header (context) */}
      {view.prompt ? <SubagentPrompt prompt={view.prompt} /> : null}

      {/* Activity trace + final output */}
      <div className="relative min-h-0 flex-1">
        {!isAtBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label={localize('com_ui_subagent_scroll_to_bottom')}
            className="absolute bottom-3 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border-light bg-surface-secondary text-text-secondary shadow-md transition hover:bg-surface-tertiary hover:text-text-primary"
          >
            <ArrowDown size={16} aria-hidden="true" />
          </button>
        )}
        <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto px-3 py-3">
          <div ref={contentRef} className="flex max-w-full flex-col gap-0">
            <SubagentBody
              toolCallId={runId}
              running={running}
              contentParts={view.contentParts}
              output={view.output}
            />
            {view.attachments && view.attachments.length > 0 && (
              <AttachmentGroup attachments={view.attachments} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
