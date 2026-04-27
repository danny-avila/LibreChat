import React, { useEffect, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ExternalLink, X } from 'lucide-react';

export type BklSource = {
  source?: {
    url?: string;
    embed_url?: string;
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
};

export default function ChunkModal({ isOpen, onClose, source, citationNumber }: ChunkModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const meta = source?.metadata?.[0];
  const fileName = meta?.name ?? meta?.file_name ?? '출처 문서';
  const pageInfo = meta?.page_info;
  const relevanceRaw = meta?.relevance;
  const chunkText = source?.document?.[0] ?? '';
  const sourceUrl = source?.source?.url ?? source?.source?.embed_url;

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
