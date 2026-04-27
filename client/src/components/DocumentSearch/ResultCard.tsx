import React, { useState } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import type { ChunkPreview, DocumentHit } from '~/data-provider/DocumentSearch';
import { useLocalize } from '~/hooks';
import { cn, FileTypeIcon, fileExtensionLabel } from '~/utils';

interface ResultCardProps {
  hit: DocumentHit;
  query: string;
  isSelected?: boolean;
  onClick?: () => void;
}

/** case-insensitive token highlighter */
function queryTokens(query: string): string[] {
  return query
    .replace(/[+"()]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim().replace(/^[|-]+|[~*]+$/g, ''))
    .filter((t) => t.length >= 1);
}

function highlight(text: string, query: string): React.ReactNode {
  if (!text) return null;
  const tokens = queryTokens(query);
  if (tokens.length === 0) return text;

  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(re);
  const tokenSet = new Set(tokens.map((t) => t.toLowerCase()));
  return parts.map((part, i) =>
    tokenSet.has(part.toLowerCase()) ? (
      <mark
        key={i}
        className="rounded bg-yellow-200 px-0.5 font-medium text-text-primary dark:bg-yellow-700/60"
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

function cleanPreviewText(content: string): string {
  return content
    .replace(/<!--\s*BKL_SEG\b[^>]*-->/gi, '')
    .replace(/^\s*\[(본문|첨부[^\]\n]*)\]\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildSnippet(content: string, query: string, maxLen = 260): string {
  const cleaned = cleanPreviewText(content);
  if (!cleaned) return '';
  const tokens = queryTokens(query);
  const lower = cleaned.toLowerCase();
  let idx = -1;
  for (const t of tokens) {
    const hit = lower.indexOf(t.toLowerCase());
    if (hit !== -1) {
      idx = hit;
      break;
    }
  }
  if (idx === -1) {
    return cleaned.slice(0, maxLen) + (cleaned.length > maxLen ? '…' : '');
  }
  const start = Math.max(0, idx - 80);
  const end = Math.min(cleaned.length, start + maxLen);
  return (start > 0 ? '…' : '') + cleaned.slice(start, end) + (end < cleaned.length ? '…' : '');
}

function previewForChunk(chunk: ChunkPreview, query: string): string {
  const snippet = cleanPreviewText(chunk.snippet || '');
  if (snippet && snippet !== '...') return snippet;
  return buildSnippet(chunk.content, query);
}

// `fileExtension` / `extensionLabel` / `ExtensionIcon` were inlined here
// originally; they now live in `~/utils/fileTypeIcon.tsx` so the citation
// chip and the BKL sources panel render the same icon set.

interface ChunkRowProps {
  chunk: ChunkPreview;
  index: number;
  total: number;
  query: string;
}

const ChunkRow: React.FC<ChunkRowProps> = ({ chunk, index, total, query }) => {
  const [expanded, setExpanded] = useState(false);
  const pageInfo =
    chunk.page_start != null
      ? chunk.page_end != null && chunk.page_end !== chunk.page_start
        ? `p.${chunk.page_start}-${chunk.page_end}`
        : `p.${chunk.page_start}`
      : null;
  const preview = previewForChunk(chunk, query);
  const expandedText = cleanPreviewText(chunk.content) || chunk.content;

  return (
    <div className="group/chunk rounded-md border border-transparent px-2 py-2 hover:border-border-light hover:bg-surface-hover">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 text-left outline-none focus-visible:ring-1 focus-visible:ring-border-heavy"
      >
        <ChevronRight
          className={cn(
            'h-3 w-3 shrink-0 text-text-tertiary transition-transform',
            expanded && 'rotate-90',
          )}
          aria-hidden="true"
        />
        <span className="inline-flex h-5 shrink-0 items-center rounded bg-surface-secondary px-1.5 text-[10px] font-semibold tabular-nums text-text-secondary">
          {index + 1}/{total}
        </span>
        {pageInfo && (
          <span className="shrink-0 text-[11px] tabular-nums text-text-tertiary">{pageInfo}</span>
        )}
      </button>
      <div className="mt-1 pl-5">
        {expanded ? (
          <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-text-primary">
            {highlight(expandedText, query)}
          </pre>
        ) : (
          <p className="line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text-secondary">
            {highlight(preview, query)}
          </p>
        )}
      </div>
    </div>
  );
};

const ResultCard: React.FC<ResultCardProps> = ({ hit, query, isSelected, onClick }) => {
  const localize = useLocalize();
  const displayedChunkCount = hit.top_chunks.length;
  const matchedChunkCount = hit.chunk_count || displayedChunkCount;
  const chunkCountLabel =
    matchedChunkCount > displayedChunkCount
      ? `표시 ${displayedChunkCount}개 / 매칭 ${matchedChunkCount}개`
      : `${localize('com_document_search_matched_chunks')}: ${matchedChunkCount}`;

  const metaBadges = [
    hit.work_type,
    hit.document_type,
    hit.practice_area_primary,
  ].filter(Boolean) as string[];

  return (
    <article
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        'group border-b border-border-light py-4 transition-colors',
        onClick && 'cursor-pointer hover:bg-surface-hover',
        isSelected && 'bg-surface-active-alt',
      )}
    >
      <div className="flex items-center gap-2 px-4">
        <span className="inline-flex h-5 shrink-0 items-center rounded-sm border border-border-medium bg-surface-secondary px-1.5 text-[10px] font-semibold leading-none tabular-nums tracking-wide text-text-secondary">
          {fileExtensionLabel(hit.file_name)}
        </span>
        <FileTypeIcon name={hit.file_name} className="h-4 w-4 shrink-0" />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
          {hit.file_name || hit.doc_id}
        </h3>
        {hit.source_url && (
          <a
            href={hit.source_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            aria-label="원문 보기"
            title="원문 보기"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            원문
          </a>
        )}
      </div>

      {hit.top_chunks.length > 0 && (
        <div
          className={cn(
            'mt-2 flex flex-col gap-1 px-3',
            hit.top_chunks.length > 3 && 'max-h-72 overflow-y-auto pr-2',
          )}
        >
          {hit.top_chunks.map((c, i) => (
            <ChunkRow
              key={c.chunk_id || `${hit.doc_id}-${i}`}
              chunk={c}
              index={i}
              total={displayedChunkCount}
              query={query}
            />
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 text-[11px] text-text-secondary">
        {(hit.imanage_create_date || hit.document_date) && (
          <span className="tabular-nums">
            {(hit.imanage_create_date || hit.document_date)!.slice(0, 10)}
          </span>
        )}
        {metaBadges.map((b) => (
          <span key={b} className="text-text-secondary">
            · {b}
          </span>
        ))}
        <span className="ml-auto tabular-nums">
          {chunkCountLabel}
        </span>
      </div>
    </article>
  );
};

export { highlight, buildSnippet };
export default ResultCard;
