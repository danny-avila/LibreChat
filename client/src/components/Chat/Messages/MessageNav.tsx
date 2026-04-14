import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { HoverCard, HoverCardTrigger, HoverCardPortal, HoverCardContent } from '@librechat/client';
import { cn } from '~/utils';

type MessageEntry = {
  id: string;
  isUser: boolean;
  preview: string;
};

function getMessageEntries(): MessageEntry[] {
  const nodes = document.querySelectorAll<HTMLElement>('.message-render');
  const entries: MessageEntry[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const id = node.id;
    if (!id) {
      continue;
    }

    const isUser = node.querySelector('.user-turn') != null;
    const turnEl = isUser ? node.querySelector('.user-turn') : node.querySelector('.agent-turn');
    const contentEl = isUser
      ? (turnEl?.querySelector('.flex.flex-col.gap-1') ?? turnEl)
      : (node.querySelector('.markdown') ?? turnEl);

    const rawText = contentEl?.textContent ?? '';
    const preview = rawText.trim().slice(0, 80) + (rawText.trim().length > 80 ? '...' : '');

    entries.push({ id, isUser, preview });
  }

  return entries;
}

const SCROLL_MARGIN = 16;
const AT_TOP_THRESHOLD = 20;

function scrollToMessageStart(id: string) {
  const el = document.getElementById(id);
  if (!el) {
    return;
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function isMessageAtTop(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) {
    return true;
  }
  const container = el.closest('.scrollbar-gutter-stable');
  if (!container) {
    return true;
  }
  const distanceFromTop = el.getBoundingClientRect().top - container.getBoundingClientRect().top;
  return (
    distanceFromTop >= -AT_TOP_THRESHOLD && distanceFromTop <= SCROLL_MARGIN + AT_TOP_THRESHOLD
  );
}

function MessageIndicator({ entry, isActive }: { entry: MessageEntry; isActive: boolean }) {
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={() => scrollToMessageStart(entry.id)}
          className={cn('flex h-[5px] items-center justify-center', entry.isUser ? 'w-4' : 'w-6')}
          aria-label={`Go to ${entry.isUser ? 'user' : 'assistant'} message: ${entry.preview.slice(0, 30)}`}
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
}

export default function MessageNav({
  scrollableRef,
}: {
  scrollableRef: React.RefObject<HTMLDivElement>;
}) {
  const [entries, setEntries] = useState<MessageEntry[]>([]);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastKnownIndexRef = useRef(0);

  const { firstActiveIndex, lastActiveIndex } = useMemo(() => {
    let first = -1;
    let last = -1;
    for (let i = 0; i < entries.length; i++) {
      if (activeIds.has(entries[i].id)) {
        if (first === -1) {
          first = i;
        }
        last = i;
      }
    }
    if (first !== -1) {
      lastKnownIndexRef.current = first;
    } else if (entries.length > 0) {
      first = Math.min(lastKnownIndexRef.current, entries.length - 1);
      last = first;
    }
    return { firstActiveIndex: first, lastActiveIndex: last };
  }, [entries, activeIds]);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleSetRef = useRef(new Set<string>());

  const refreshEntries = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      const next = getMessageEntries();
      setEntries((prev) => {
        if (prev.length === next.length && prev.every((e, i) => e.id === next[i].id)) {
          return prev;
        }
        return next;
      });
    }, 200);
  }, []);

  useEffect(() => {
    refreshEntries();

    const container = scrollableRef.current;
    if (!container) {
      return;
    }

    const mutationObserver = new MutationObserver(() => {
      refreshEntries();
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
        setActiveIds(new Set(visibleSet));
      },
      { root, threshold: 0.01 },
    );

    observerRef.current = observer;

    for (const msg of entries) {
      const el = document.getElementById(msg.id);
      if (el) {
        observer.observe(el);
      }
    }

    return () => observer.disconnect();
  }, [entries, scrollableRef]);

  const jumpToPrevious = useCallback(() => {
    if (firstActiveIndex < 0) {
      return;
    }
    const currentId = entries[firstActiveIndex].id;
    if (!isMessageAtTop(currentId) && firstActiveIndex > 0) {
      scrollToMessageStart(currentId);
      return;
    }
    if (firstActiveIndex <= 0) {
      scrollToMessageStart(entries[0].id);
      return;
    }
    scrollToMessageStart(entries[firstActiveIndex - 1].id);
  }, [firstActiveIndex, entries]);

  const jumpToNext = useCallback(() => {
    if (lastActiveIndex < 0 || lastActiveIndex >= entries.length - 1) {
      return;
    }
    scrollToMessageStart(entries[lastActiveIndex + 1].id);
  }, [lastActiveIndex, entries]);

  if (entries.length < 3) {
    return null;
  }

  const canGoUp =
    firstActiveIndex > 0 || (firstActiveIndex === 0 && !isMessageAtTop(entries[0].id));
  const canGoDown = lastActiveIndex >= 0 && lastActiveIndex < entries.length - 1;

  return (
    <nav
      aria-label="Message navigation"
      className="group/nav absolute right-2 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-1.5 rounded-full px-1 py-2 opacity-30 transition-opacity duration-300 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5 md:flex"
    >
      <button
        type="button"
        onClick={jumpToPrevious}
        disabled={!canGoUp}
        className="rounded-md p-0.5 text-text-tertiary transition-colors group-hover/nav:text-text-secondary group-hover/nav:hover:text-text-primary group-hover/nav:disabled:opacity-30"
        aria-label="Navigate to previous message"
      >
        <ChevronUp className="h-4 w-4" />
      </button>

      <div className="flex flex-col items-center gap-1.5">
        {entries.map((entry) => (
          <MessageIndicator key={entry.id} entry={entry} isActive={activeIds.has(entry.id)} />
        ))}
      </div>

      <button
        type="button"
        onClick={jumpToNext}
        disabled={!canGoDown}
        className="rounded-md p-0.5 text-text-tertiary transition-colors group-hover/nav:text-text-secondary group-hover/nav:hover:text-text-primary group-hover/nav:disabled:opacity-30"
        aria-label="Navigate to next message"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </nav>
  );
}
