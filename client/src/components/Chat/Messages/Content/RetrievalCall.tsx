import { useMemo, useState, useEffect, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { FileText } from 'lucide-react';
import { Tools } from 'librechat-data-provider';
import { TooltipAnchor } from '@librechat/client';
import type { TAttachment } from 'librechat-data-provider';
import { useLocalize, useProgress, useExpandCollapse } from '~/hooks';
import { ToolIcon, OutputRenderer, isError } from './ToolOutput';
import FilePreviewDialog from './FilePreviewDialog';
import ProgressText from './ProgressText';
import store from '~/store';
import cn from '~/utils/cn';

interface FileSource {
  fileId: string;
  fileName: string;
  relevance: number;
  content: string;
  pages: number[];
  pageRelevance: Record<number, number>;
  metadata?: Record<string, unknown>;
}

function extractFileSources(attachments?: TAttachment[]): FileSource[] {
  if (!attachments) {
    return [];
  }

  const deduped = new Map<string, FileSource>();

  for (const att of attachments) {
    if (att.type !== Tools.file_search || !att[Tools.file_search]) {
      continue;
    }

    const raw = att[Tools.file_search] as { sources?: FileSource[] };
    if (!raw.sources) {
      continue;
    }

    for (const source of raw.sources) {
      const key = source.fileId;
      const existing = deduped.get(key);

      if (existing) {
        const mergedPages = [...new Set([...existing.pages, ...(source.pages || [])])].sort(
          (a, b) => a - b,
        );
        existing.pages = mergedPages;
        existing.relevance = Math.max(existing.relevance, source.relevance || 0);
        existing.pageRelevance = { ...existing.pageRelevance, ...source.pageRelevance };
        if (!existing.content && source.content) {
          existing.content = source.content;
        }
      } else {
        deduped.set(key, {
          fileId: source.fileId,
          fileName: source.fileName,
          relevance: source.relevance || 0,
          content: source.content || '',
          pages: source.pages || [],
          pageRelevance: source.pageRelevance || {},
          metadata: source.metadata,
        });
      }
    }
  }

  return Array.from(deduped.values()).sort((a, b) => b.relevance - a.relevance);
}

interface ParsedResult {
  filename: string;
  relevance: number;
  content: string;
}

function parseRetrievalOutput(raw: string): ParsedResult[] {
  const sections = raw.split('\n---\n');
  const results: ParsedResult[] = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) {
      continue;
    }

    let filename = '';
    let relevance = 0;
    const contentLines: string[] = [];
    let inContent = false;

    for (const line of trimmed.split('\n')) {
      if (inContent) {
        contentLines.push(line);
        continue;
      }

      if (line.startsWith('File: ')) {
        filename = line.slice(6).trim();
      } else if (line.startsWith('Relevance: ')) {
        relevance = parseFloat(line.slice(11).trim()) || 0;
      } else if (line.startsWith('Content: ')) {
        inContent = true;
        contentLines.push(line.slice(9));
      }
    }

    if (filename) {
      results.push({ filename, relevance, content: contentLines.join('\n').trim() });
    }
  }

  return results;
}

function FileHeader({
  fileName,
  relevance,
  pages,
  onOpenPreview,
}: {
  fileName: string;
  relevance: number;
  pages?: number[];
  onOpenPreview?: () => void;
}) {
  const localize = useLocalize();

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <FileText className="size-3.5 shrink-0 text-text-secondary" aria-hidden="true" />
      {onOpenPreview ? (
        <button
          type="button"
          onClick={onOpenPreview}
          className="min-w-0 truncate text-left text-xs font-medium text-text-primary underline decoration-border-medium underline-offset-2 transition-colors hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy focus-visible:ring-offset-1"
          aria-label={`${localize('com_ui_preview')}: ${fileName}`}
        >
          {fileName}
        </button>
      ) : (
        <span className="min-w-0 truncate text-xs font-medium text-text-primary">{fileName}</span>
      )}
      {relevance > 0 && (
        <TooltipAnchor
          description={localize('com_ui_relevance')}
          side="top"
          className="flex items-center"
        >
          <span
            className="shrink-0 rounded bg-surface-tertiary px-1.5 py-0.5 text-[11px] tabular-nums leading-none text-text-secondary"
            aria-label={`${localize('com_ui_relevance')}: ${Math.round(relevance * 100)}%`}
          >
            {Math.round(relevance * 100)}%
          </span>
        </TooltipAnchor>
      )}
      {pages && pages.length > 0 && (
        <>
          <span className="flex-1" />
          <span className="shrink-0 text-[11px] text-text-secondary">
            {localize('com_file_pages', { pages: pages.join(', ') })}
          </span>
        </>
      )}
    </div>
  );
}

export default function RetrievalCall({
  initialProgress = 0.1,
  isSubmitting,
  output,
  attachments,
}: {
  initialProgress: number;
  isSubmitting: boolean;
  output?: string;
  attachments?: TAttachment[];
}) {
  const progress = useProgress(initialProgress);
  const localize = useLocalize();

  const errorState = typeof output === 'string' && isError(output);
  const cancelled = !isSubmitting && initialProgress < 1 && !errorState;
  const hasOutput = !!output && !isError(output);
  const autoExpand = useRecoilValue(store.autoExpandTools);
  const [showOutput, setShowOutput] = useState(() => autoExpand && hasOutput);
  const expandStyle = useExpandCollapse(showOutput);

  const fileSources = useMemo(() => extractFileSources(attachments), [attachments]);
  const parsedResults = useMemo(
    () => (hasOutput && output && fileSources.length === 0 ? parseRetrievalOutput(output) : []),
    [hasOutput, output, fileSources.length],
  );

  const hasResults = fileSources.length > 0 || parsedResults.length > 0;

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewType, setPreviewType] = useState<'source' | 'parsed'>('source');

  const openPreview = useCallback((index: number, type: 'source' | 'parsed') => {
    setPreviewIndex(index);
    setPreviewType(type);
  }, []);

  const closePreview = useCallback((open: boolean) => {
    if (!open) {
      setPreviewIndex(null);
    }
  }, []);

  const previewData = useMemo(() => {
    if (previewIndex === null) {
      return null;
    }
    if (previewType === 'source' && fileSources[previewIndex]) {
      const s = fileSources[previewIndex];
      return { fileName: s.fileName, fileId: s.fileId, relevance: s.relevance, pages: s.pages };
    }
    if (previewType === 'parsed' && parsedResults[previewIndex]) {
      const p = parsedResults[previewIndex];
      return { fileName: p.filename, relevance: p.relevance };
    }
    return null;
  }, [previewIndex, previewType, fileSources, parsedResults]);

  useEffect(() => {
    if (autoExpand && hasOutput) {
      setShowOutput(true);
    }
  }, [autoExpand, hasOutput]);

  return (
    <div className="my-1">
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {(() => {
          if (progress < 1 && !cancelled) {
            return localize('com_ui_searching_files');
          }
          if (cancelled) {
            return localize('com_ui_cancelled');
          }
          return localize('com_ui_retrieved_files');
        })()}
      </span>
      <div className="relative my-1 flex h-5 shrink-0 items-center gap-2.5">
        <ProgressText
          progress={progress}
          onClick={hasOutput ? () => setShowOutput((prev) => !prev) : undefined}
          inProgressText={localize('com_ui_searching_files')}
          finishedText={localize('com_ui_retrieved_files')}
          errorSuffix={errorState && !cancelled ? localize('com_ui_tool_failed') : undefined}
          icon={
            <ToolIcon type="file_search" isAnimating={progress < 1 && !cancelled && !errorState} />
          }
          hasInput={hasOutput}
          isExpanded={showOutput}
          error={cancelled}
        />
      </div>
      <div style={expandStyle}>
        <div className="overflow-hidden">
          {hasOutput && hasResults && (
            <div className="my-2 flex flex-col gap-2">
              {(fileSources.length > 0 ? fileSources : parsedResults).map((item, i) => {
                const isSource = 'fileId' in item;
                const fileName = isSource
                  ? (item as FileSource).fileName
                  : (item as ParsedResult).filename;
                const fileId = isSource ? (item as FileSource).fileId : undefined;
                return (
                  <div
                    key={fileId ?? i}
                    className={cn(
                      'overflow-hidden rounded-lg border border-border-light bg-surface-secondary',
                    )}
                  >
                    <FileHeader
                      fileName={fileName}
                      relevance={item.relevance}
                      pages={isSource ? (item as FileSource).pages : undefined}
                      onOpenPreview={fileId ? () => openPreview(i, 'source') : undefined}
                    />
                    {item.content && (
                      <div className="border-t border-border-light px-3 py-3">
                        <OutputRenderer text={item.content} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <FilePreviewDialog
        open={previewData !== null}
        onOpenChange={closePreview}
        fileName={previewData?.fileName ?? ''}
        fileId={previewData?.fileId}
        relevance={previewData?.relevance}
        pages={previewData?.pages}
      />
    </div>
  );
}
