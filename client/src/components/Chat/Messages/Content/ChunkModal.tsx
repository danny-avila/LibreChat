import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ExternalLink, X } from 'lucide-react';

export type BklSource = {
  source?: {
    url?: string;
    embed_url?: string;
    imanage_url?: string;
    imanage_preview_url?: string;
  };
  document: string[];
  metadata: Array<{
    name?: string;
    file_name?: string;
    page_info?: string;
    relevance?: number | string;
    [key: string]: unknown;
  }>;
};

type ChunkModalProps = {
  isOpen: boolean;
  onClose: () => void;
  source: BklSource | null;
  citationNumber: number;
  messageId?: string;
};

const _LS_PREFIX = 'bkl_src_';

function hasImanageUrl(source: BklSource | null): boolean {
  const meta = source?.metadata?.[0];
  return Boolean(
    source?.source?.imanage_url ||
      source?.source?.imanage_preview_url ||
      (typeof meta?.imanage_url === 'string' && meta.imanage_url) ||
      (typeof meta?.imanage_preview_url === 'string' && meta.imanage_preview_url),
  );
}

function getRequestId(messageId?: string): string | null {
  if (!messageId) return null;
  const win = window as any;
  const fromMemory = win.__bklRids?.[messageId];
  if (typeof fromMemory === 'string' && fromMemory) return fromMemory;

  try {
    const raw = localStorage.getItem(`${_LS_PREFIX}${messageId}`);
    if (!raw) return null;
    const { r } = JSON.parse(raw);
    return typeof r === 'string' && r ? r : null;
  } catch {
    return null;
  }
}

function cacheSources(
  messageId: string | undefined,
  requestId: string | null,
  sources: BklSource[],
) {
  if (!messageId || !sources.length) return;
  const win = window as any;
  win.__bklSources = win.__bklSources ?? {};
  win.__bklSources[messageId] = sources;
  if (requestId) {
    win.__bklSourcesByRid = win.__bklSourcesByRid ?? {};
    win.__bklSourcesByRid[requestId] = sources;
  }
  try {
    localStorage.setItem(`${_LS_PREFIX}${messageId}`, JSON.stringify({ s: sources, r: requestId }));
  } catch {
    /* in-memory cache is enough if localStorage is unavailable */
  }
}

async function fetchSources(
  requestId: string | null,
): Promise<{ sources: BklSource[]; requestId: string | null } | null> {
  const url = requestId ? `/v1/sources/${requestId}` : '/v1/sources/latest';
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  const sources = data.sources ?? data;
  if (!Array.isArray(sources)) return null;
  return { sources, requestId: requestId ?? data.request_id ?? null };
}

export default function ChunkModal({
  isOpen,
  onClose,
  source,
  citationNumber,
  messageId,
}: ChunkModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const attemptedEnrichmentRef = useRef<string | null>(null);
  const [resolvedSource, setResolvedSource] = useState<BklSource | null>(source);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    setResolvedSource(source);
  }, [source]);

  useEffect(() => {
    if (!isOpen || !citationNumber || hasImanageUrl(resolvedSource)) {
      return;
    }

    let cancelled = false;
    const requestId = getRequestId(messageId);
    const attemptKey = `${messageId ?? 'unknown'}:${citationNumber}:${requestId ?? 'latest'}`;
    if (attemptedEnrichmentRef.current === attemptKey) {
      return;
    }
    attemptedEnrichmentRef.current = attemptKey;

    fetchSources(requestId)
      .then((result) => {
        if (cancelled || !result) return;
        cacheSources(messageId, result.requestId, result.sources);
        const nextSource = result.sources[citationNumber - 1] ?? null;
        if (nextSource) setResolvedSource(nextSource);
      })
      .catch(() => {
        /* Leave the existing source visible if enrichment fails. */
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, citationNumber, messageId, resolvedSource]);

  const activeSource = useMemo(() => resolvedSource ?? source, [resolvedSource, source]);
  const meta = activeSource?.metadata?.[0];
  const fileName = meta?.name ?? meta?.file_name ?? '출처 문서';
  const pageInfo = meta?.page_info;
  const relevanceRaw = meta?.relevance;
  const chunkText = activeSource?.document?.[0] ?? '';
  const sourceUrl = activeSource?.source?.url ?? activeSource?.source?.embed_url;
  const imanageUrl =
    activeSource?.source?.imanage_url ??
    activeSource?.source?.imanage_preview_url ??
    (typeof meta?.imanage_url === 'string' ? meta.imanage_url : undefined) ??
    (typeof meta?.imanage_preview_url === 'string' ? meta.imanage_preview_url : undefined);

  // relevance: 0–1이면 *100, 이미 0–100이면 그대로 (100 초과 시 100으로 캡)
  const relevanceDisplay =
    relevanceRaw == null
      ? null
      : typeof relevanceRaw === 'number'
        ? relevanceRaw <= 1
          ? `${(relevanceRaw * 100).toFixed(1)}%`
          : `${Math.min(100, Math.round(relevanceRaw)).toFixed(0)}%`
        : String(relevanceRaw);

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[201] max-h-[80vh] w-[min(90vw,680px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border-medium bg-surface-primary shadow-2xl outline-none"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            closeButtonRef.current?.focus();
          }}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-border-medium px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-text-primary">{fileName}</h2>
              <div className="mt-1 flex items-center gap-3 text-xs text-text-secondary">
                {pageInfo && <span>{pageInfo}</span>}
                {relevanceDisplay && (
                  <span className="rounded bg-surface-secondary px-1.5 py-0.5">
                    관련도 {relevanceDisplay}
                  </span>
                )}
              </div>
            </div>
            <div className="ml-3 flex flex-shrink-0 items-center gap-1">
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md p-1 text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                  aria-label="원문 보기"
                  title="원문 보기"
                >
                  <ExternalLink className="size-4" />
                </a>
              )}
              {imanageUrl && (
                <a
                  href={imanageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                  aria-label="iManage에서 보기"
                  title="iManage에서 보기"
                >
                  <ExternalLink className="size-3.5" />
                  iManage
                </a>
              )}
              <button
                ref={closeButtonRef}
                onClick={onClose}
                className="rounded-md p-1 text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                aria-label="닫기"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto px-5 py-4" style={{ maxHeight: 'calc(80vh - 80px)' }}>
            {chunkText ? (
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-text-primary">
                {chunkText}
              </pre>
            ) : (
              <p className="text-sm text-text-secondary">내용을 불러올 수 없습니다.</p>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
