import React from 'react';
import { FileText } from 'lucide-react';
import type { DocumentHit } from '~/data-provider/DocumentSearch';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface ResultCardProps {
  hit: DocumentHit;
  query: string;
  isSelected: boolean;
  onClick: () => void;
}

/** Very light-weight highlighter — case-insensitive, token-per-token. */
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
      <mark key={i} className="rounded bg-yellow-200 px-0.5 text-text-primary dark:bg-yellow-700/60">
        {part}
      </mark>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

function buildSnippet(content: string, query: string, maxLen = 220): string {
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
  const start = Math.max(0, idx - 60);
  const end = Math.min(content.length, start + maxLen);
  return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
}

const ResultCard: React.FC<ResultCardProps> = ({ hit, query, isSelected, onClick }) => {
  const localize = useLocalize();

  const badges = [
    hit.work_type,
    hit.document_type,
    hit.practice_area_primary,
  ].filter(Boolean) as string[];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full flex-col gap-2 rounded-xl border px-4 py-3 text-left transition-colors',
        isSelected
          ? 'border-blue-500 bg-surface-active-alt'
          : 'border-border-light bg-surface-primary hover:border-border-medium hover:bg-surface-hover',
      )}
    >
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-text-primary">
              {hit.file_name || hit.doc_id}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-text-secondary">
              {hit.score.toFixed(2)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
            {hit.document_date && <span className="tabular-nums">{hit.document_date}</span>}
            {badges.map((b) => (
              <span
                key={b}
                className="rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] text-text-secondary"
              >
                {b}
              </span>
            ))}
            <span className="ml-auto">
              {localize('com_document_search_matched_chunks')}: {hit.chunk_count}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {hit.top_chunks.slice(0, 3).map((c) => (
          <div
            key={c.chunk_id}
            className="rounded-md bg-surface-secondary/60 px-3 py-2 text-xs text-text-secondary"
          >
            {c.section && (
              <div className="mb-1 text-[11px] font-medium text-text-tertiary">
                {c.section}
                {c.page_start ? ` · p.${c.page_start}${c.page_end && c.page_end !== c.page_start ? `-${c.page_end}` : ''}` : ''}
              </div>
            )}
            <div className="line-clamp-3 whitespace-pre-wrap break-words leading-relaxed">
              {highlight(buildSnippet(c.content, query), query)}
            </div>
          </div>
        ))}
      </div>
    </button>
  );
};

export { highlight, buildSnippet };
export default ResultCard;
