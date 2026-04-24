import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRecoilState } from 'recoil';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { Button } from '@librechat/client';
import store from '~/store';
import type { BklSource } from './ChunkModal';

/**
 * Right-side panel that displays BKL document citations when the user clicks
 * a `[N]` marker in an assistant message.
 *
 * This component is rendered inside `SidePanelGroup`'s artifact `ResizablePanel`
 * slot (see `Presentation.tsx` — when `activeBklSource` is set, the citation
 * panel replaces any active artifact). That gives us:
 *   - the same resizable right-side surface as LibreChat artifacts,
 *   - the same transition / mobile behaviour (handled by `SidePanelGroup`),
 *   - no custom fixed-position overlay plumbing.
 *
 * The chrome (header, close button, body wrapper) mirrors `Artifacts.tsx`
 * exactly so the citation panel is visually indistinguishable from a native
 * LibreChat side panel.
 *
 * Data lives on `window.__bklSources[messageId]`, populated by the SSE
 * `sources_replace` event and/or a REST fallback in `BklCitation.tsx`. This
 * panel is a passive reader of that cache.
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

  /**
   * Re-read cached sources whenever the active messageId changes, and poll
   * briefly if sources haven't arrived yet (the SSE `sources_replace` event
   * may land slightly after the user clicks the very first `[N]`).
   */
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

  if (!active) return null;

  return (
    <div className="flex h-full w-full flex-col bg-surface-primary text-text-primary">
      {/* Header — mirrors Artifacts.tsx chrome: surface-primary-alt bar with
          a subtle bottom border and a ghost-icon close button on the right. */}
      <div className="flex flex-shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-border-light bg-surface-primary-alt px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wider text-text-secondary">
            출처 {active.n}
            {total > 0 ? <span className="ml-1 text-text-tertiary">/ {total}</span> : null}
          </div>
          <PanelTitle source={current} />
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => goTo(active.n - 1)}
            disabled={active.n <= 1}
            aria-label="이전 출처"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => goTo(active.n + 1)}
            disabled={active.n >= total}
            aria-label="다음 출처"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
          <ViewerLink source={current} />
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="닫기">
            <X size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Body — matches Artifacts inner panel: flex-1 column, overflow-hidden,
          with the scroll area inside so the header stays pinned. */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-primary">
        <div className="flex-1 overflow-y-auto px-5 py-4 text-base">
          {current ? (
            <PanelBody source={current} />
          ) : sources == null ? (
            <p className="text-sm text-text-secondary">출처를 불러오는 중…</p>
          ) : (
            <p className="text-sm text-text-secondary">출처 정보를 찾을 수 없습니다.</p>
          )}
        </div>

        {total > 1 ? (
          <div className="flex flex-shrink-0 flex-wrap gap-1.5 border-t border-border-light bg-surface-primary-alt px-3 py-2">
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
    </div>
  );
}

function PanelTitle({ source }: { source: BklSource | null }) {
  if (!source) return <h2 className="mt-0.5 truncate text-sm font-semibold text-text-primary">—</h2>;
  const meta = source.metadata?.[0];
  const rawName = meta?.name ?? meta?.file_name ?? '출처 문서';
  const fileName = extractFileName(rawName);
  const pageInfo = meta?.page_info;
  const relevance = formatRelevance(meta?.relevance);
  return (
    <>
      <h2 className="mt-0.5 truncate text-sm font-semibold text-text-primary" title={fileName}>
        {fileName}
      </h2>
      {(pageInfo || relevance) && (
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          {pageInfo ? <span>{pageInfo}</span> : null}
          {relevance ? (
            <span className="rounded bg-surface-secondary px-1.5 py-0.5">관련도 {relevance}</span>
          ) : null}
        </div>
      )}
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
  // `source.source` is a looser shape than the typed `BklSource`, so we cast
  // through unknown to safely read the optional url fields.
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
      className="inline-flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary"
      aria-label="원본 보기"
      title="원본 보기"
    >
      <ExternalLink size={16} aria-hidden="true" />
    </a>
  );
}
