import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRecoilState } from 'recoil';
import { X } from 'lucide-react';
import { Button } from '@librechat/client';
import store from '~/store';
import { cn } from '~/utils';
import MarkdownLite from './MarkdownLite';
import type { BklSource } from './ChunkModal';

// Keep in sync with the `duration-*` utilities on the root div below. The
// close animation keeps the component mounted for this long so users see the
// panel slide out before it unmounts.
const CLOSE_ANIM_MS = 300;

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

  // Slide-in / slide-out animation, mirroring `Artifacts.tsx` so the citation
  // panel feels like a first-class LibreChat surface. `isVisible` drives the
  // enter transition (delayed one tick after mount). `isClosing` keeps the
  // panel mounted for CLOSE_ANIM_MS after `onClose`, so the slide-out has
  // time to play before we actually null out the Recoil atom and unmount.
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  /**
   * Drive the enter animation. Whenever a citation becomes active (either
   * from null → set, or from one `[N]` to another while we're still open),
   * cancel any pending close timer and fire a next-tick `isVisible=true` so
   * the root div transitions from `translate-x-5 opacity-0` → `translate-x-0
   * opacity-100`.
   */
  useEffect(() => {
    if (!active) return;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsClosing(false);
    const t = setTimeout(() => setIsVisible(true), 30);
    return () => clearTimeout(t);
  }, [active]);

  const onClose = useCallback(() => {
    // Play the slide-out first, then clear the Recoil atom (which unmounts
    // this component via the `!active` guard below).
    setIsClosing(true);
    setIsVisible(false);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setActive(null);
      setIsClosing(false);
      closeTimerRef.current = null;
    }, CLOSE_ANIM_MS);
  }, [setActive]);

  // Cleanup any pending close timer on unmount so we don't late-write to an
  // unmounted tree if the user navigates away mid-animation.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [active, onClose]);

  const current = useMemo(() => {
    if (!active || !sources) return null;
    return sources[active.n - 1] ?? null;
  }, [active, sources]);

  if (!active) return null;

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col bg-surface-primary text-text-primary shadow-2xl',
        // Desktop slide: same translate-x / opacity values as the native
        // Artifacts panel (`Artifacts.tsx`). Mobile path isn't handled here —
        // `SidePanelGroup` wraps us in `fixed inset-0 z-[100]` on small screens,
        // so the panel covers the viewport without needing a separate
        // translate-y animation.
        isVisible && !isClosing
          ? 'translate-x-0 opacity-100 transition-all duration-300'
          : 'translate-x-5 opacity-0 transition-all duration-300',
      )}
    >
      {/* Header — mirrors Artifacts.tsx chrome: surface-primary-alt bar with
          a subtle bottom border and a ghost-icon close button on the right.
          We intentionally do NOT surface prev/next or a "3 / 10" counter:
          only a subset of the retrieved chunks are actually cited in the
          answer, so exposing navigation across all retrieved sources would
          mislead the user into treating unused chunks as evidence. The
          panel shows exactly the one chunk whose `[N]` marker was clicked. */}
      <div className="flex flex-shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-border-light bg-surface-primary-alt px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wider text-text-secondary">
            출처 [{active.n}]
          </div>
          <PanelTitle source={current} />
        </div>
        <div className="flex items-center gap-1">
          {/* Previously rendered a "원본 보기" (ExternalLink) button pointing
              at `/viewer/...` which served raw `.msg` bytes → garbled text.
              The replacement flow is inline: the OCR pipeline persists each
              attachment as a PDF and injects a `[📎 원본 파일: ...]` markdown
              link into the chunk body itself, so users click the link inside
              the panel content (rendered by MarkdownLite below) and the PDF
              opens in a new tab. That makes the header button redundant. */}
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
  // MarkdownLite (GFM + math + code highlighting) renders the chunk body,
  // which now includes `[📎 원본 파일: ...]( /v1/attachments/{hash}.pdf )`
  // links injected by the OCR pipeline (`msg_processor._assemble()`). The
  // shared `a` component from MarkdownComponents opens external links in a
  // new tab by default, so no extra wrapping is needed here.
  //
  // `prose-sm` + `dark:prose-invert` matches the typography used in the
  // assistant message surface; `max-w-none` lets paragraphs fill the panel
  // width instead of the default `prose` narrow measure.
  return (
    <div className="prose prose-sm max-w-none break-words text-text-primary dark:prose-invert">
      <MarkdownLite content={text} codeExecution={false} />
    </div>
  );
}
