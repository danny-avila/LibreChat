import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { ContentTypes } from 'librechat-data-provider';
import { HoverCard, HoverCardTrigger, HoverCardPortal, HoverCardContent } from '@librechat/client';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';
import { useGetMessagesByConvoId } from '~/data-provider';
import { useMessagesConversation } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type MessageEntry = {
  id: string;
  isUser: boolean;
  preview: string;
};

function extractPreviewFromContent(content?: TMessageContentParts[]): string {
  if (!content) {
    return '';
  }
  for (const part of content) {
    if (part.type === ContentTypes.TEXT) {
      const textField = part[ContentTypes.TEXT];
      if (typeof textField === 'string' && textField.trim()) {
        return textField;
      }
      if (textField && typeof textField === 'object' && 'value' in textField) {
        const value = (textField as { value?: string }).value;
        if (value?.trim()) {
          return value;
        }
      }
    }
  }
  return '';
}

function buildEntry(id: string, msg: TMessage): MessageEntry {
  const raw = msg.text?.trim() ? msg.text : extractPreviewFromContent(msg.content);
  const trimmed = raw.trim();
  return {
    id,
    isUser: !!msg.isCreatedByUser,
    preview: trimmed.slice(0, 80) + (trimmed.length > 80 ? '...' : ''),
  };
}

function buildFallbackEntry(node: HTMLElement, id: string): MessageEntry {
  const isUser = node.querySelector('.user-turn') != null;
  const trimmed = (node.textContent ?? '').trim();
  return {
    id,
    isUser,
    preview: trimmed.slice(0, 80) + (trimmed.length > 80 ? '...' : ''),
  };
}

function getMessageEntries(root: ParentNode, messagesById: Map<string, TMessage>): MessageEntry[] {
  const nodes = root.querySelectorAll<HTMLElement>('.message-render');
  const entries: MessageEntry[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const id = node.id;
    if (!id) {
      continue;
    }
    const msg = messagesById.get(id);
    entries.push(msg ? buildEntry(id, msg) : buildFallbackEntry(node, id));
  }
  return entries;
}

const JUMP_EPS = 4;

const SCROLL_DURATION = 400;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function scrollToMessageStart(id: string) {
  const el = document.getElementById(id);
  if (!el) {
    return;
  }
  const container = el.closest<HTMLElement>('.scrollbar-gutter-stable');
  if (!container) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const scrollMargin = readScrollMargin(el);
  const startScroll = container.scrollTop;
  const start = performance.now();

  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / SCROLL_DURATION);
    const current = document.getElementById(id);
    if (!current) {
      return;
    }
    const cRect = container.getBoundingClientRect();
    const elRect = current.getBoundingClientRect();
    const targetScroll = container.scrollTop + (elRect.top - cRect.top) - scrollMargin;
    const max = container.scrollHeight - container.clientHeight;
    const clamped = Math.max(0, Math.min(targetScroll, max));
    container.scrollTop = startScroll + (clamped - startScroll) * easeOutCubic(progress);
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  };

  requestAnimationFrame(step);
}

function readScrollMargin(el: HTMLElement | null): number {
  if (!el) {
    return 0;
  }
  const value = parseFloat(getComputedStyle(el).scrollMarginTop);
  return Number.isFinite(value) ? value : 0;
}

const MessageIndicator = memo(function MessageIndicator({
  entry,
  isActive,
  label,
}: {
  entry: MessageEntry;
  isActive: boolean;
  label: string;
}) {
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={() => scrollToMessageStart(entry.id)}
          className={cn('flex h-[5px] items-center justify-center', entry.isUser ? 'w-4' : 'w-6')}
          aria-label={label}
          data-msg-id={entry.id}
        >
          <span
            className={cn(
              'block w-full rounded-full transition-all duration-200',
              isActive
                ? 'h-[5px] bg-gray-800 dark:bg-gray-100'
                : 'h-[3px] bg-gray-400 dark:bg-gray-500',
            )}
          />
        </button>
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent side="left" sideOffset={12} className="z-[999] max-w-[280px] px-3 py-2">
          <p className="line-clamp-3 text-xs text-text-secondary">{entry.preview}</p>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
});

export default function MessageNav({
  scrollableRef,
}: {
  scrollableRef: React.RefObject<HTMLDivElement>;
}) {
  const localize = useLocalize();
  const { conversationId } = useMessagesConversation();
  const { data: messages } = useGetMessagesByConvoId(conversationId ?? '', {
    enabled: !!conversationId,
  });
  const messagesById = useMemo(() => {
    const map = new Map<string, TMessage>();
    if (messages) {
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (m.messageId) {
          map.set(m.messageId, m);
        }
      }
    }
    return map;
  }, [messages]);
  const [entries, setEntries] = useState<MessageEntry[]>([]);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [canGoUp, setCanGoUp] = useState(false);
  const [canGoDown, setCanGoDown] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const columnRef = useRef<HTMLDivElement>(null);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleSetRef = useRef(new Set<string>());

  const refreshEntries = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      const root = scrollableRef.current ?? document;
      const next = getMessageEntries(root, messagesById);
      setEntries((prev) => {
        if (
          prev.length === next.length &&
          prev.every((e, i) => e.id === next[i].id && e.preview === next[i].preview)
        ) {
          return prev;
        }
        return next;
      });
    }, 200);
  }, [scrollableRef, messagesById]);

  useEffect(() => {
    refreshEntries();

    const container = scrollableRef.current;
    if (!container) {
      return;
    }

    const mutationObserver = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.addedNodes.length || m.removedNodes.length) {
          for (let j = 0; j < m.addedNodes.length; j++) {
            const n = m.addedNodes[j] as HTMLElement;
            if (
              n.nodeType === 1 &&
              (n.classList?.contains('message-render') || n.querySelector?.('.message-render'))
            ) {
              refreshEntries();
              return;
            }
          }
          for (let j = 0; j < m.removedNodes.length; j++) {
            const n = m.removedNodes[j] as HTMLElement;
            if (
              n.nodeType === 1 &&
              (n.classList?.contains('message-render') || n.querySelector?.('.message-render'))
            ) {
              refreshEntries();
              return;
            }
          }
        }
      }
    });

    mutationObserver.observe(container, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [scrollableRef, refreshEntries]);

  useEffect(() => {
    const container = scrollableRef.current;
    if (!container || entries.length === 0) {
      setCanGoUp(false);
      setCanGoDown(false);
      return;
    }

    const offsetsTop: number[] = new Array(entries.length);
    const offsetsBottom: number[] = new Array(entries.length);
    for (let i = 0; i < entries.length; i++) {
      const el = document.getElementById(entries[i].id);
      offsetsTop[i] = el ? el.offsetTop : Number.POSITIVE_INFINITY;
      offsetsBottom[i] = el ? el.offsetTop + el.offsetHeight : Number.POSITIVE_INFINITY;
    }

    const firstEl = document.getElementById(entries[0].id);
    const scrollMargin = readScrollMargin(firstEl);

    let frameId: number | null = null;

    const tick = () => {
      frameId = null;

      const scrollTop = container.scrollTop;
      let nextCanUp = false;
      let nextCanDown = false;
      for (let i = 0; i < offsetsTop.length; i++) {
        const snap = offsetsTop[i] - scrollMargin;
        if (snap < scrollTop - JUMP_EPS) {
          nextCanUp = true;
        } else if (snap > scrollTop + JUMP_EPS) {
          nextCanDown = true;
          break;
        }
      }
      setCanGoUp((prev) => (prev === nextCanUp ? prev : nextCanUp));
      setCanGoDown((prev) => (prev === nextCanDown ? prev : nextCanDown));

      const col = columnRef.current;
      if (!col) {
        return;
      }
      const viewBottom = scrollTop + container.clientHeight;
      let first = -1;
      let last = -1;
      for (let i = 0; i < offsetsTop.length; i++) {
        if (offsetsBottom[i] <= scrollTop) {
          continue;
        }
        if (offsetsTop[i] >= viewBottom) {
          break;
        }
        if (first === -1) {
          first = i;
        }
        last = i;
      }
      if (first === -1) {
        return;
      }
      const firstInd = col.children[first] as HTMLElement | undefined;
      const lastInd = col.children[last] as HTMLElement | undefined;
      if (!firstInd || !lastInd) {
        return;
      }
      const mid = (firstInd.offsetTop + lastInd.offsetTop + lastInd.offsetHeight) / 2;
      const target = mid - col.clientHeight / 2;
      col.scrollTop = Math.max(0, Math.min(target, col.scrollHeight - col.clientHeight));
    };

    const onScroll = () => {
      if (frameId != null) {
        return;
      }
      frameId = requestAnimationFrame(tick);
    };

    tick();
    container.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', onScroll);
      if (frameId != null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [entries, scrollableRef]);

  useEffect(() => {
    const root = scrollableRef.current;
    if (!root || entries.length === 0) {
      return;
    }

    observerRef.current?.disconnect();

    const visibleSet = visibleSetRef.current;
    const entryIds = new Set(entries.map((e) => e.id));
    for (const id of visibleSet) {
      if (!entryIds.has(id)) {
        visibleSet.delete(id);
      }
    }

    let pendingFrame: number | null = null;
    const flush = () => {
      pendingFrame = null;
      setActiveIds((prev) => {
        if (prev.size === visibleSet.size) {
          let same = true;
          for (const id of visibleSet) {
            if (!prev.has(id)) {
              same = false;
              break;
            }
          }
          if (same) {
            return prev;
          }
        }
        return new Set(visibleSet);
      });
    };

    const observer = new IntersectionObserver(
      (intersections) => {
        for (const entry of intersections) {
          const id = entry.target.id;
          if (entry.isIntersecting) {
            visibleSet.add(id);
          } else {
            visibleSet.delete(id);
          }
        }
        if (pendingFrame == null) {
          pendingFrame = requestAnimationFrame(flush);
        }
      },
      { root, threshold: 0 },
    );

    observerRef.current = observer;

    for (const msg of entries) {
      const el = document.getElementById(msg.id);
      if (el) {
        observer.observe(el);
      }
    }

    return () => {
      observer.disconnect();
      if (pendingFrame != null) {
        cancelAnimationFrame(pendingFrame);
      }
    };
  }, [entries, scrollableRef]);

  const jumpToPrevious = useCallback(() => {
    const container = scrollableRef.current;
    if (!container || entries.length === 0) {
      return;
    }
    const scrollTop = container.scrollTop;
    const firstEl = document.getElementById(entries[0].id);
    const scrollMargin = readScrollMargin(firstEl);
    for (let i = entries.length - 1; i >= 0; i--) {
      const el = document.getElementById(entries[i].id);
      if (!el) {
        continue;
      }
      if (el.offsetTop - scrollMargin < scrollTop - JUMP_EPS) {
        scrollToMessageStart(entries[i].id);
        return;
      }
    }
    container.scrollTo({ top: 0, behavior: 'smooth' });
  }, [entries, scrollableRef]);

  const jumpToNext = useCallback(() => {
    const container = scrollableRef.current;
    if (!container || entries.length === 0) {
      return;
    }
    const scrollTop = container.scrollTop;
    const firstEl = document.getElementById(entries[0].id);
    const scrollMargin = readScrollMargin(firstEl);
    for (let i = 0; i < entries.length; i++) {
      const el = document.getElementById(entries[i].id);
      if (!el) {
        continue;
      }
      if (el.offsetTop - scrollMargin > scrollTop + JUMP_EPS) {
        scrollToMessageStart(entries[i].id);
        return;
      }
    }
  }, [entries, scrollableRef]);

  if (entries.length < 3) {
    return null;
  }

  return (
    <nav
      aria-label={localize('com_ui_message_nav')}
      className="group/nav absolute right-2 top-1/2 z-40 hidden max-h-[min(24rem,calc(100%-2rem))] -translate-y-1/2 flex-col items-center gap-1.5 rounded-full px-1 py-2 opacity-30 transition-opacity duration-300 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5 md:flex"
    >
      <button
        type="button"
        onClick={jumpToPrevious}
        disabled={!canGoUp}
        className="rounded-md p-0.5 text-text-tertiary transition-colors group-hover/nav:text-text-secondary group-hover/nav:hover:text-text-primary group-hover/nav:disabled:opacity-30"
        aria-label={localize('com_ui_message_nav_previous')}
      >
        <ChevronUp className="h-4 w-4" />
      </button>

      <div
        ref={columnRef}
        className="flex min-h-0 flex-col items-center gap-1.5 overflow-y-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {entries.map((entry) => (
          <MessageIndicator
            key={entry.id}
            entry={entry}
            isActive={activeIds.has(entry.id)}
            label={localize(
              entry.isUser ? 'com_ui_message_nav_go_to_user' : 'com_ui_message_nav_go_to_assistant',
              { 0: entry.preview.slice(0, 30) },
            )}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={jumpToNext}
        disabled={!canGoDown}
        className="rounded-md p-0.5 text-text-tertiary transition-colors group-hover/nav:text-text-secondary group-hover/nav:hover:text-text-primary group-hover/nav:disabled:opacity-30"
        aria-label={localize('com_ui_message_nav_next')}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </nav>
  );
}
