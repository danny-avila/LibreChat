import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRecoilState } from 'recoil';
import { ExternalLink, X } from 'lucide-react';
import { Button } from '@librechat/client';
import store from '~/store';
import { cn, FileTypeIcon } from '~/utils';
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

/**
 * Build the SectionBadge label from PR-B segment metadata. Returns null when
 * the chunk did not come from a segmented .msg.md (legacy index slices, raw
 * PDFs / DOCX, etc.) so the badge area stays empty rather than showing
 * misleading "본문" tags for non-email documents.
 *
 * Body chunks render as just "본문". Attachment chunks fold the index pair
 * + filename together — `첨부 1/3 · 계약서.docx` — so the user can tell at a
 * glance that the cited text came from an attachment of a forwarded thread
 * vs. the main email body.
 */
function getSectionBadge(meta: Record<string, unknown> | undefined): {
  kind: 'body' | 'attachment';
  label: string;
  filename?: string;
} | null {
  if (!meta) return null;
  const kind = (meta.section_kind as string | undefined) ?? null;
  if (!kind) return null;
  if (kind === 'attachment') {
    const idx = meta.attachment_idx as number | undefined;
    const total = meta.attachment_total as number | undefined;
    const filename = (meta.attachment_filename as string | undefined) ?? '';
    const counter = idx && total ? `첨부 ${idx}/${total}` : '첨부';
    return { kind: 'attachment', label: counter, filename };
  }
  if (kind === 'body') {
    return { kind: 'body', label: '본문' };
  }
  return null;
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
          <div className="flex min-w-0 items-start gap-2">
            <PanelTitleIcon source={current} />
            <div className="min-w-0 flex-1">
              <PanelTitle source={current} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <OriginalSourceButton source={current} />
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

/**
 * Resolve the URL to open when the user clicks "원본 보기" in the panel
 * header. The retrieval payload may carry one of two shapes:
 *
 *   1. An MSG-attachment chunk: `viewer_url` is pre-populated by the
 *      indexer with `/v1/attachments/{sha256}.pdf` — that PDF is the
 *      attachment converted from the original .docx/.xlsx/etc., served
 *      directly from `attachments-static`. We open it as-is.
 *   2. Anything else (.msg itself, standalone .pdf/.docx/.hwp uploads,
 *      or pre-PR-B legacy chunks where the indexer didn't stamp a
 *      viewer_url): we fall back to `/v1/source-files/{doc_id}`, which
 *      proxies through the corpus-static origin to the original file.
 *      For .msg this returns a server-rendered HTML viewer
 *      (subject/body/attachments) instead of raw OLE garbage.
 *
 *      Note: this is `/v1/source-files/` (not `/v1/sources/`). The
 *      latter is owned by `generate.py` for the chat sources cache —
 *      see src/api/routes/source_viewer.py for the rename rationale.
 *
 * The base nginx in front of bkl-api routes both `/v1/attachments/*`
 * and `/v1/source-files/*` straight to the FastAPI service, so neither
 * URL needs the LibreChat `/bkl/` prefix.
 *
 * Returns null when neither source is available so the button stays
 * hidden rather than rendering a dead link.
 */
/**
 * Build the chunk-excerpt that we forward to the .msg viewer as
 * `?highlight=...`. The backend uses it to scroll-into-view + flash
 * the matching passage so the user lands directly on the cited
 * sentence instead of having to re-read the whole email.
 *
 * Trade-offs:
 *  - We strip the leading `[본문] / [첨부 N/M · file]` marker (same
 *    rule the panel body uses) so the needle starts on real prose.
 *  - We collapse runs of whitespace to single spaces — the rendered
 *    .msg body keeps Outlook's literal `\n` paragraph breaks, but
 *    the chunker normalises whitespace, so an exact substring would
 *    almost never hit. The viewer's regex uses `\s+` to bridge the
 *    gap; we keep the prefix short here so the URL stays reasonable.
 *  - 200 chars is the sweet spot empirically: short enough to fit
 *    well under any browser/proxy URL limit (the result, after
 *    percent-encoding Korean chars, is ~600 bytes), long enough to
 *    pin the right paragraph even on chunk boundaries that share
 *    a common opening phrase ("안녕하세요" etc.).
 */
const _HIGHLIGHT_MAX = 200;
function buildHighlightExcerpt(source: BklSource | null): string | null {
  if (!source) return null;
  const raw = source.document?.[0] ?? '';
  if (!raw) return null;
  const stripped = stripLeadingSegmentMarker(raw).replace(/\s+/g, ' ').trim();
  if (stripped.length < 4) return null;
  return stripped.substring(0, _HIGHLIGHT_MAX);
}

function resolveOriginalSourceUrl(source: BklSource | null): string | null {
  if (!source) return null;
  const meta = source.metadata?.[0];
  if (!meta) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = meta as any;
  if (typeof m.viewer_url === 'string' && m.viewer_url.length > 0) {
    // Attachment PDFs go straight to attachments-static — Chrome's
    // built-in PDF viewer doesn't support deep-linking to a phrase
    // via fragment, so we don't append `highlight=` here. Future
    // work could pass `#page=N` once the indexer stamps page hits.
    return m.viewer_url;
  }
  if (typeof m.doc_id === 'string' && m.doc_id.length > 0) {
    let url = `/v1/source-files/${encodeURIComponent(m.doc_id)}`;
    const excerpt = buildHighlightExcerpt(source);
    if (excerpt) {
      url += `?highlight=${encodeURIComponent(excerpt)}`;
    }
    return url;
  }
  return null;
}

function OriginalSourceButton({ source }: { source: BklSource | null }) {
  const url = resolveOriginalSourceUrl(source);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="원본 보기"
      aria-label="원본 보기"
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md',
        'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
        'focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-border-medium',
      )}
    >
      <ExternalLink size={16} aria-hidden="true" />
    </a>
  );
}

function PanelTitleIcon({ source }: { source: BklSource | null }) {
  if (!source) return null;
  const meta = source.metadata?.[0];
  // Prefer the explicit `file_type` field if the backend surfaces one (PR-C),
  // and fall back to parsing the extension from the citation header. Either
  // way the same icon set lives in `FileTypeIcon`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ext = (meta as any)?.file_type ?? null;
  const rawName = meta?.name ?? meta?.file_name ?? '';
  return (
    <FileTypeIcon
      ext={ext}
      name={rawName}
      className="mt-0.5 h-5 w-5 shrink-0"
    />
  );
}

function PanelTitle({ source }: { source: BklSource | null }) {
  if (!source) return <h2 className="mt-0.5 truncate text-sm font-semibold text-text-primary">—</h2>;
  const meta = source.metadata?.[0];
  const rawName = meta?.name ?? meta?.file_name ?? '출처 문서';
  const fileName = extractFileName(rawName);
  const pageInfo = meta?.page_info;
  const relevance = formatRelevance(meta?.relevance);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const badge = getSectionBadge(meta as any);
  return (
    <>
      <h2 className="mt-0.5 truncate text-sm font-semibold text-text-primary" title={fileName}>
        {fileName}
      </h2>
      {(badge || pageInfo || relevance) && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
          {badge ? (
            <SectionBadge
              kind={badge.kind}
              label={badge.label}
              filename={badge.filename}
            />
          ) : null}
          {pageInfo ? <span>{pageInfo}</span> : null}
          {relevance ? (
            <span className="rounded bg-surface-secondary px-1.5 py-0.5">관련도 {relevance}</span>
          ) : null}
        </div>
      )}
    </>
  );
}

/**
 * Visual distinction between email-body and attachment chunks (PR-B).
 *
 * Body chunks get a neutral pill so they read as "this came from the email
 * itself." Attachment chunks get a tinted pill that surfaces both the
 * `첨부 N/M` counter and the original filename, mirroring what we removed
 * from the chunk markdown (the `## 첨부 N/M — fname` heading and the
 * `[📎 원본 파일]` link line both moved into segment metadata so the chunk
 * body is clean, and we render that metadata explicitly here instead).
 */
function SectionBadge({
  kind,
  label,
  filename,
}: {
  kind: 'body' | 'attachment';
  label: string;
  filename?: string;
}) {
  const tone =
    kind === 'attachment'
      ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200'
      : 'bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-200';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium',
        tone,
      )}
      title={filename || label}
    >
      <span>{label}</span>
      {filename ? (
        <span className="max-w-[200px] truncate font-normal opacity-90">· {filename}</span>
      ) : null}
    </span>
  );
}

/**
 * Strip the leading `[본문]` / `[첨부 N/M · file]` marker line that the
 * indexer prepends to chunk content for body/attachment provenance.
 *
 * The marker is *embedded inside the chunk text* on purpose (so retrieval
 * embeddings and the LLM context both see it), but the citation panel
 * already surfaces the same information as a `SectionBadge` in the title
 * area. Rendering the marker a second time as the first line of the body
 * just looks like noise — see user report 2026-04-26 ("첨부파일인데
 * [본문] 이라고 나오는 경우가 꽤 많이 있는 것 같은데").
 *
 * The indexer fix (`emit_markers = any(s.kind === 'attachment')` in
 * index_documents.py) prevents [본문] from being prepended to standalone
 * non-MSG documents going forward, but legacy index slices written before
 * that fix still carry the marker — this strip handles both.
 */
const _CHUNK_MARKER_RE = /^\s*\[(?:본문|첨부(?:\s+\d+\s*\/\s*\d+)?(?:\s*[·•]\s*[^\]\n]+)?)\]\s*\n+/u;
function stripLeadingSegmentMarker(text: string): string {
  if (!text) return text;
  return text.replace(_CHUNK_MARKER_RE, '');
}

/**
 * Defensively unescape mammoth's over-eager backslash-escaping of
 * punctuation that is virtually never markdown-significant in mid-
 * paragraph Korean prose.
 *
 * `mammoth.convert_to_markdown` defensively writes `\(`, `\)`, `\[`,
 * `\]`, `\.`, `\-`, `\+`, `\=`, `\|` for ASCII punctuation embedded in
 * paragraph runs. Three things go wrong when that lands in this panel:
 *
 *  1. `\(...\)` is the LaTeX inline-math delimiter that
 *     `MarkdownLite`'s `remark-math`/`rehype-katex` chain happily
 *     consumes — KaTeX strips intra-math whitespace and re-renders
 *     Latin runs in math-italic glyphs. That's why "Mobile Virtual
 *     Network Operator" / "KT" / "SKT" / "LGU\+" come out as the
 *     mathematical italic block (`𝑀𝑜𝑏𝑖𝑙𝑒𝑉𝑖𝑟𝑡𝑢𝑎𝑙…`) with no spaces in
 *     the legal-doc panel screenshot (2026-04-26 user report
 *     "워드 파일 청크가 이상하게 보여").
 *  2. `\.`, `\-`, `\+` etc. occasionally leak through React-Markdown
 *     verbatim ("정리하였습니다\." instead of "정리하였습니다.").
 *  3. The escapes pollute embeddings and chunk-snippet readability.
 *
 * Backend (`mammoth_docx_processor.py`) now strips these escapes
 * before chunking, but legacy index slices written before that fix
 * still carry them. Apply the same normalisation client-side as a
 * belt-and-braces measure so panels never render math-italicised
 * legal text again.
 *
 * Why these specific characters: they have *no* CommonMark meaning
 * inside a paragraph (parens are only special as link tails, brackets
 * as link openers, periods only after a digit at the start of a line).
 * We intentionally do not unescape `\*`, `\_`, `` \` ``, `\\`, `\#`,
 * `\!`, `\{`, `\}`, `\~` — those genuinely need escaping.
 */
const _MAMMOTH_UNESCAPE_RE = /\\([()\[\].\-+=|<>])/g;
function normaliseMammothEscapes(text: string): string {
  if (!text || text.indexOf('\\') === -1) return text;
  return text.replace(_MAMMOTH_UNESCAPE_RE, '$1');
}

function PanelBody({ source }: { source: BklSource }) {
  const rawText = source.document?.[0] ?? '';
  const text = normaliseMammothEscapes(stripLeadingSegmentMarker(rawText));
  if (!text) return <p className="text-sm text-text-secondary">내용을 불러올 수 없습니다.</p>;
  // MarkdownLite (GFM + math + code highlighting) renders the chunk body.
  // PR-B moves the `## 첨부 N/M — fname` heading + `[📎 원본 파일]` link
  // into segment metadata (rendered as `SectionBadge` above), so chunk
  // bodies should usually contain no level-2 / level-3 headings at all.
  //
  // The prose-h{2,3} overrides are still in place as a defense-in-depth:
  // legacy index slices (pre-PR-B re-index) and OCR'd attachments that
  // happen to start with a real H2 in the source document still benefit
  // from the down-sized typography so a single heading at the top of a
  // chunk no longer dominates the panel.
  //
  // `prose-sm` + `dark:prose-invert` matches the typography used in the
  // assistant message surface; `max-w-none` lets paragraphs fill the panel
  // width instead of the default `prose` narrow measure.
  return (
    <div
      className={cn(
        'prose prose-sm max-w-none break-words text-text-primary dark:prose-invert',
        'prose-h1:text-base prose-h1:font-semibold prose-h1:my-2',
        'prose-h2:text-sm prose-h2:font-semibold prose-h2:my-2',
        'prose-h3:text-sm prose-h3:font-semibold prose-h3:my-1.5',
        'prose-h4:text-sm prose-h4:font-medium prose-h4:my-1.5',
      )}
    >
      <MarkdownLite content={text} codeExecution={false} />
    </div>
  );
}
