import React, { useState } from 'react';
import { FileText, Mail, FileType2, File as FileIcon, ChevronRight } from 'lucide-react';
import type { ChunkPreview, DocumentHit } from '~/data-provider/DocumentSearch';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface ResultCardProps {
  hit: DocumentHit;
  query: string;
  isSelected?: boolean;
  onClick?: () => void;
}

/** case-insensitive token highlighter */
function highlight(text: string, query: string): React.ReactNode {
  if (!text) return null;
  const tokens = query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 1);
  if (tokens.length === 0) return text;

  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(re);
  return parts.map((part, i) =>
    re.test(part) ? (
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

function buildSnippet(content: string, query: string, maxLen = 260): string {
  if (!content) return '';
  const tokens = query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const lower = content.toLowerCase();
  let idx = -1;
  for (const t of tokens) {
    const hit = lower.indexOf(t.toLowerCase());
    if (hit !== -1) {
      idx = hit;
      break;
    }
  }
  if (idx === -1) {
    return content.slice(0, maxLen) + (content.length > maxLen ? '…' : '');
  }
  const start = Math.max(0, idx - 80);
  const end = Math.min(content.length, start + maxLen);
  return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
}

function fileExtension(name: string): string {
  if (!name) return '';
  const base = name.split('/').pop() ?? name;
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase();
}

function extensionLabel(name: string): string {
  const ext = fileExtension(name);
  return ext ? ext.toUpperCase() : 'DOC';
}

function ExtensionIcon({ name }: { name: string }) {
  const ext = fileExtension(name);
  const base = 'h-4 w-4 shrink-0';
  if (ext === 'msg' || ext === 'eml') return <Mail className={cn(base, 'text-sky-600')} />;
  if (ext === 'pdf') return <FileText className={cn(base, 'text-red-600')} />;
  if (ext === 'docx' || ext === 'doc') return <FileType2 className={cn(base, 'text-blue-600')} />;
  if (ext === 'md') return <FileText className={cn(base, 'text-emerald-600')} />;
  return <FileIcon className={cn(base, 'text-text-secondary')} />;
}

interface ChunkRowProps {
  chunk: ChunkPreview;
  index: number;
  query: string;
  localize: ReturnType<typeof useLocalize>;
}

const ChunkRow: React.FC<ChunkRowProps> = ({ chunk, index, query, localize }) => {
  const [expanded, setExpanded] = useState(false);
  const pageInfo =
    chunk.page_start != null
      ? chunk.page_end != null && chunk.page_end !== chunk.page_start
        ? `p.${chunk.page_start}-${chunk.page_end}`
        : `p.${chunk.page_start}`
      : null;

  return (
    <div className="group/chunk rounded-md border border-transparent px-2 py-1.5 hover:border-border-light hover:bg-surface-hover">
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
          {localize('com_document_search_chunk_label', { 0: String(index + 1) })}
        </span>
        {chunk.section && (
          <span className="inline-flex h-5 shrink-0 items-center rounded bg-surface-secondary px-1.5 text-[10px] text-text-tertiary">
            {localize('com_document_search_section_prefix')}: {chunk.section}
          </span>
        )}
        {pageInfo && (
          <span className="shrink-0 text-[11px] tabular-nums text-text-tertiary">{pageInfo}</span>
        )}
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-text-tertiary">
          {chunk.score.toFixed(2)}
        </span>
      </button>
      <div className="mt-1 pl-5">
        {expanded ? (
          <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-text-primary">
            {highlight(chunk.content, query)}
          </pre>
        ) : (
          <p className="line-clamp-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text-secondary">
            {highlight(buildSnippet(chunk.content, query), query)}
          </p>
        )}
      </div>
    </div>
  );
};

const ResultCard: React.FC<ResultCardProps> = ({ hit, query, isSelected, onClick }) => {
  const localize = useLocalize();

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
      <div className="flex items-start gap-2 px-4">
        <span className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded-sm border border-border-medium bg-surface-secondary px-1.5 text-[10px] font-semibold tabular-nums tracking-wide text-text-secondary">
          {extensionLabel(hit.file_name)}
        </span>
        <ExtensionIcon name={hit.file_name} />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
          {hit.file_name || hit.doc_id}
        </h3>
        <span
          className="shrink-0 text-[11px] tabular-nums text-text-secondary"
          title={localize('com_document_search_score')}
        >
          {localize('com_document_search_score')} {hit.score.toFixed(2)}
        </span>
      </div>

      {hit.top_chunks.length > 0 && (
        <div className="mt-2 flex flex-col gap-1 px-3">
          {hit.top_chunks.slice(0, 3).map((c, i) => (
            <ChunkRow key={c.chunk_id} chunk={c} index={i} query={query} localize={localize} />
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
        <span className="ml-auto">
          {localize('com_document_search_matched_chunks')}: {hit.chunk_count}
        </span>
      </div>
    </article>
  );
};

export { highlight, buildSnippet };
export default ResultCard;
