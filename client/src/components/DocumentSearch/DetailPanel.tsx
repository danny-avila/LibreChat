import React from 'react';
import { FileText, Search } from 'lucide-react';
import type { DocumentHit } from '~/data-provider/DocumentSearch';
import { useLocalize } from '~/hooks';
import { highlight } from './ResultCard';

interface DetailPanelProps {
  hit: DocumentHit | null;
  query: string;
}

const DetailPanel: React.FC<DetailPanelProps> = ({ hit, query }) => {
  const localize = useLocalize();

  if (!hit) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-text-secondary">
        <Search className="h-10 w-10 opacity-50" aria-hidden="true" />
        <p className="text-sm">{localize('com_document_search_select_hint')}</p>
      </div>
    );
  }

  const metaRows: Array<[string, string | null | undefined]> = [
    [localize('com_document_search_meta_doc_id'), hit.doc_id],
    [localize('com_document_search_meta_date'), hit.document_date],
    [localize('com_document_search_meta_work_type'), hit.work_type],
    [localize('com_document_search_meta_doc_type'), hit.document_type],
    [localize('com_document_search_meta_practice_area'), hit.practice_area_primary],
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border-light px-6 py-4">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-6 w-6 shrink-0 text-text-secondary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-text-primary">
              {hit.file_name || hit.doc_id}
            </h2>
            <p className="mt-1 text-xs text-text-secondary">
              {localize('com_document_search_score')}: {hit.score.toFixed(2)} ·{' '}
              {localize('com_document_search_matched_chunks')}: {hit.chunk_count}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          {metaRows.map(([k, v]) => (
            <React.Fragment key={k}>
              <span className="text-text-secondary">{k}</span>
              <span className="truncate text-text-primary">{v || '-'}</span>
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">
          {localize('com_document_search_matched_chunks')}
        </h3>
        <div className="flex flex-col gap-3">
          {hit.top_chunks.map((c) => (
            <div
              key={c.chunk_id}
              className="rounded-lg border border-border-light bg-surface-primary p-4"
            >
              <div className="mb-2 flex items-center justify-between text-xs text-text-secondary">
                <span className="font-medium text-text-primary">
                  {c.section || localize('com_document_search_unnamed_section')}
                  {c.page_start
                    ? ` · p.${c.page_start}${c.page_end && c.page_end !== c.page_start ? `-${c.page_end}` : ''}`
                    : ''}
                </span>
                <span className="tabular-nums">{c.score.toFixed(2)}</span>
              </div>
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text-primary">
                {highlight(c.content, query)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DetailPanel;
