import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRecoilState } from 'recoil';
import { X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import store from '~/store';
import type { BklSource } from './ChunkModal';

/**
 * Right-side drawer that displays BKL document citations when the user
 * clicks a `[N]` marker in an assistant message.
 *
 * Design notes:
 *   - This is rendered once at the Presentation level and driven by the
 *     `activeBklSource` Recoil atom, so there is only ever one drawer
 *     instance alive regardless of how many messages are on screen.
 *   - The drawer is an *overlay* (fixed-position, not part of the flex
 *     layout) rather than a ResizablePanel sibling to Artifacts. That
 *     trades away resize-handle UX for a self-contained component that
 *     does not touch `SidePanelGroup` layout math and therefore survives
 *     LibreChat upstream refactors with near-zero merge friction.
 *   - Data lives on `window.__bklSources[messageId]`, populated by the
 *     SSE `sources_replace` event and/or a REST fallback in
 *     `BklCitation.tsx`. The drawer is a passive reader of that cache.
 */

function readSources(messageId: string): BklSource[] | null {
  if (!messageId) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  const mem = win.__bklSources?.[messageId];
  if (Array.isArray(mem) && mem.length > 0) return mem;
  try {
    const raw = localStorage.getItem('bkl_src_' + messageId);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.s) && parsed.s.length > 0) return parsed.s;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function extractFileName(metaName: string): string {
  const m = metaName.normalize('NFC').match(/^『(.+?)』/);
  return m ? m[1] : metaName.normalize('NFC');
}

function formatRelevance(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    if (raw <= 1) return `${(raw * 100).toFixed(1)}%`;
    return `${Math.min(100, Math.round(raw)).toFixed(0)}%`;
  }
  return String(raw);
}

export default function BklSourcesPanel() {
  const [active, setActive] = useRecoilState(store.activeBklSource);
  const [sources, setSources] = useState<BklSource[] | null>(null);

  // Re-read cached sources whenever the active messageId changes OR whenever
  // we are open but don't have sources yet (the SSE sources_replace event
  // may arrive slightly after the user clicks the very first [N]).
  useEffect(() => {
    if (!active) {
      setSources(null);
      return;
    }
    const initial = readSources(active.messageId);
    setSources(initial);
    if (initial) return;

    let cancelled = false;
    const iv = setInterval(() => {
      if (cancelled) return;
      const s = readSources(active.messageId);
      if (s) {
        setSources(s);
        clearInterval(iv);
      }
    }, 400);
    const to = setTimeout(() => clearInterval(iv), 20_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
      clearTimeout(to);
    };
  }, [active?.messageId]);

  const onClose = useCallback(() => setActive(null), [setActive]);

  // ESC closes the drawer when open.
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [active, onClose]);

  const total = sources?.length ?? 0;
  const current = useMemo(() => {
    if (!active || !sources) return null;
    return sources[active.n - 1] ?? null;
  }, [active, sources]);

  const goTo = useCallback(
    (n: number) => {
      if (!active) return;
      if (n < 1 || n > total) return;
      setActive({ messageId: active.messageId, n });
    },
    [active, total, setActive],
  );

  const isOpen = active != null;

  return (
    <>
      {/* Backdrop — subtle so it doesn't feel like a modal dialog. Clicking
          it closes the drawer, matching the LibreChat Artifacts UX. */}
      <div
        className={
          'fixed inset-0 z-[190] bg-black/20 backdrop-blur-[1px] transition-opacity duration-200 md:hidden ' +
          (isOpen ? 'opacity-100' : 'pointer-events-none opacity-0')
        }
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        aria-hidden={!isOpen}
        className={
          'fixed right-0 top-0 z-[191] h-full w-full max-w-[min(100vw,520px)] transform border-l border-border-medium bg-surface-primary shadow-2xl transition-transform duration-200 ease-out ' +
          (isOpen ? 'translate-x-0' : 'translate-x-full')
        }
      >
        {isOpen && active ? (
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-border-medium px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium uppercase tracking-wider text-text-secondary">
                  출처 {active.n}
                  {total > 0 ? <span className="ml-1 text-text-tertiary">/ {total}</span> : null}
                </div>
                <PanelTitle source={current} />
              </div>
              <button
                onClick={onClose}
                className="ml-3 flex-shrink-0 rounded-md p-1 text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                aria-label="닫기"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Nav row (prev / next + jump to viewer) */}
            <div className="flex items-center gap-2 border-b border-border-medium px-5 py-2 text-xs">
              <button
                onClick={() => goTo(active.n - 1)}
                disabled={active.n <= 1}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-text-secondary hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="이전 출처"
              >
                <ChevronLeft className="size-3.5" />
                이전
              </button>
              <button
                onClick={() => goTo(active.n + 1)}
                disabled={active.n >= total}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-text-secondary hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="다음 출처"
              >
                다음
                <ChevronRight className="size-3.5" />
              </button>
              <ViewerLink source={current} />
            </div>

            {/* Body: chunk content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {current ? (
                <PanelBody source={current} />
              ) : sources == null ? (
                <p className="text-sm text-text-secondary">출처를 불러오는 중…</p>
              ) : (
                <p className="text-sm text-text-secondary">출처 정보를 찾을 수 없습니다.</p>
              )}
            </div>

            {/* Footer: quick jump to any [N] */}
            {total > 1 ? (
              <div className="flex flex-wrap gap-1.5 border-t border-border-medium px-5 py-3">
                {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => goTo(n)}
                    className={
                      'inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded px-1.5 text-[11px] transition-colors ' +
                      (n === active.n
                        ? 'bg-brand-purple text-white'
                        : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary')
                    }
                    aria-current={n === active.n}
                    aria-label={`출처 ${n}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>
    </>
  );
}

function PanelTitle({ source }: { source: BklSource | null }) {
  if (!source) return <h2 className="mt-1 truncate text-sm font-semibold text-text-primary">—</h2>;
  const meta = source.metadata?.[0];
  const rawName = meta?.name ?? meta?.file_name ?? '출처 문서';
  const fileName = extractFileName(rawName);
  const pageInfo = meta?.page_info;
  const relevance = formatRelevance(meta?.relevance);
  return (
    <>
      <h2 className="mt-1 truncate text-sm font-semibold text-text-primary" title={fileName}>
        {fileName}
      </h2>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
        {pageInfo ? <span>{pageInfo}</span> : null}
        {relevance ? (
          <span className="rounded bg-surface-secondary px-1.5 py-0.5">관련도 {relevance}</span>
        ) : null}
      </div>
    </>
  );
}

function PanelBody({ source }: { source: BklSource }) {
  const text = source.document?.[0] ?? '';
  if (!text) return <p className="text-sm text-text-secondary">내용을 불러올 수 없습니다.</p>;
  return (
    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-text-primary">
      {text}
    </pre>
  );
}

function ViewerLink({ source }: { source: BklSource | null }) {
  // Cast through unknown because `source.source` is a looser shape than the
  // typed `BklSource` in ChunkModal.tsx (which was written for a different
  // purpose). We only read url/embed_url which are known optional strings.
  const url = ((source as unknown as { source?: { url?: string; embed_url?: string } } | null)
    ?.source?.url ??
    (source as unknown as { source?: { url?: string; embed_url?: string } } | null)?.source
      ?.embed_url) as string | undefined;
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-text-secondary hover:bg-surface-secondary"
    >
      원본 보기
      <ExternalLink className="size-3.5" />
    </a>
  );
}
