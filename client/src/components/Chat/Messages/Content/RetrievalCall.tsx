import { useMemo, useState, useEffect, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { Tools } from 'librechat-data-provider';
import { TooltipAnchor } from '@librechat/client';
import { FileText, FileSpreadsheet, FileCode, FileImage, File } from 'lucide-react';
import type { TAttachment, TFile } from 'librechat-data-provider';
import { useLocalize, useProgress, useExpandCollapse } from '~/hooks';
import { ToolIcon, OutputRenderer, isError } from './ToolOutput';
import FilePreviewDialog from './FilePreviewDialog';
import { sortPagesByRelevance, cn } from '~/utils';
import { useGetFiles } from '~/data-provider';
import ProgressText from './ProgressText';
import store from '~/store';

interface FileSource {
  fileId: string;
  fileName: string;
  relevance: number;
  content: string;
  pages: number[];
  pageRelevance: Record<number, number>;
  fileType?: string;
  fileBytes?: number;
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
      const meta = source.metadata as Record<string, unknown> | undefined;

      if (existing) {
        const mergedPages = [...new Set([...existing.pages, ...(source.pages || [])])];
        existing.pages = mergedPages;
        existing.relevance = Math.max(existing.relevance, source.relevance || 0);
        existing.pageRelevance = { ...existing.pageRelevance, ...source.pageRelevance };
        if (source.content && existing.content) {
          existing.content += '\n\n' + source.content;
        } else if (source.content) {
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
          fileType: (meta?.fileType as string) || undefined,
          fileBytes: (meta?.fileBytes as number) || undefined,
          metadata: meta,
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

interface DisplayResult {
  fileId?: string;
  fileName: string;
  relevance: number;
  content: string;
  pages?: number[];
  pageRelevance?: Record<number, number>;
  fileType?: string;
  fileBytes?: number;
}

interface FileMatch {
  fileId: string;
  fileName: string;
  fileType?: string;
  fileBytes?: number;
}

function normalizeFilename(filename: string): string {
  return filename.toLowerCase().replace(/[^a-z0-9.]/g, '');
}

function addFileMatch(
  lookup: Map<string, FileMatch | null>,
  fileName: string | undefined,
  match: FileMatch,
): void {
  if (!fileName) {
    return;
  }

  const key = normalizeFilename(fileName);
  if (key.length === 0) {
    return;
  }

  const existing = lookup.get(key);
  if (!existing) {
    lookup.set(key, match);
    return;
  }

  if (existing.fileId !== match.fileId) {
    lookup.set(key, null);
  }
}

function buildFileLookup(
  fileSources: FileSource[],
  files?: TFile[],
): Map<string, FileMatch | null> {
  const lookup = new Map<string, FileMatch | null>();

  for (const source of fileSources) {
    addFileMatch(lookup, source.fileName, {
      fileId: source.fileId,
      fileName: source.fileName,
      fileType: source.fileType,
      fileBytes: source.fileBytes,
    });
  }

  for (const file of files ?? []) {
    if (!file.file_id || !file.filename) {
      continue;
    }

    const key = normalizeFilename(file.filename);
    if (lookup.has(key)) {
      continue;
    }

    addFileMatch(lookup, file.filename, {
      fileId: file.file_id,
      fileName: file.filename,
      fileType: file.type ?? undefined,
      fileBytes: file.bytes,
    });
  }

  return lookup;
}

function mergeRetrievalResults(
  fileSources: FileSource[],
  parsedResults: ParsedResult[],
  files?: TFile[],
): DisplayResult[] {
  if (parsedResults.length === 0) {
    return fileSources.map((source) => ({
      fileId: source.fileId,
      fileName: source.fileName,
      relevance: source.relevance,
      content: source.content,
      pages: source.pages,
      pageRelevance: source.pageRelevance,
      fileType: source.fileType,
      fileBytes: source.fileBytes,
    }));
  }

  const fileLookup = buildFileLookup(fileSources, files);

  return parsedResults.map((result) => {
    const key = normalizeFilename(result.filename);
    const match = fileLookup.get(key) ?? undefined;

    return {
      fileId: match?.fileId,
      fileName: match?.fileName ?? result.filename,
      relevance: result.relevance,
      content: result.content,
      fileType: match?.fileType,
      fileBytes: match?.fileBytes,
    };
  });
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

function getFileIcon(mimeType?: string): React.ComponentType<{ className?: string }> {
  if (!mimeType) {
    return FileText;
  }
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
    return FileSpreadsheet;
  }
  if (mimeType.includes('image')) {
    return FileImage;
  }
  if (
    mimeType.includes('javascript') ||
    mimeType.includes('typescript') ||
    mimeType.includes('json') ||
    mimeType.includes('xml') ||
    mimeType.includes('html')
  ) {
    return FileCode;
  }
  if (mimeType.includes('pdf') || mimeType.includes('text') || mimeType.includes('word')) {
    return FileText;
  }
  return File;
}

function FileHeader({
  fileName,
  relevance,
  pages,
  pageRelevance,
  fileType,
  onOpenPreview,
}: {
  fileName: string;
  relevance: number;
  pages?: number[];
  pageRelevance?: Record<number, number>;
  fileType?: string;
  onOpenPreview?: () => void;
}) {
  const localize = useLocalize();
  const IconComponent = getFileIcon(fileType);
  const sortedPages = pages && pageRelevance ? sortPagesByRelevance(pages, pageRelevance) : pages;

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <IconComponent className="size-3.5 shrink-0 text-text-secondary" aria-hidden="true" />
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
      <span className="flex-1" />
      {sortedPages && sortedPages.length > 0 && (
        <span className="shrink-0 text-[11px] text-text-secondary">
          {localize('com_file_pages', { pages: sortedPages.join(', ') })}
        </span>
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
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(showOutput);

  const fileSources = useMemo(() => extractFileSources(attachments), [attachments]);
  const parsedResults = useMemo(
    () => (hasOutput && output ? parseRetrievalOutput(output) : []),
    [hasOutput, output],
  );
  const fileIds = useMemo(
    () => new Set(fileSources.map((s) => s.fileId).filter(Boolean)),
    [fileSources],
  );
  const { data: availableFiles = [] } = useGetFiles<TFile[]>({
    enabled: hasOutput && parsedResults.length > 0 && fileIds.size > 0,
    select: (files) => files.filter((f) => fileIds.has(f.file_id)),
  });
  const displayResults = useMemo(
    () => mergeRetrievalResults(fileSources, parsedResults, availableFiles),
    [availableFiles, fileSources, parsedResults],
  );

  const hasResults = displayResults.length > 0;

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const openPreview = useCallback((index: number) => {
    setPreviewIndex(index);
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

    const result = displayResults[previewIndex];
    if (!result?.fileId) {
      return null;
    }

    return {
      fileName: result.fileName,
      fileId: result.fileId,
      relevance: result.relevance,
      pages: result.pages,
      pageRelevance: result.pageRelevance,
      fileType: result.fileType,
    };
  }, [displayResults, previewIndex]);

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
        <div className="overflow-hidden" ref={expandRef}>
          {hasOutput && hasResults && (
            <div className="my-2 flex flex-col gap-2">
              {displayResults.map((item, i) => {
                return (
                  <div
                    key={`${item.fileId ?? item.fileName}-${i}`}
                    className={cn(
                      'overflow-hidden rounded-lg border border-border-light bg-surface-secondary',
                    )}
                  >
                    <FileHeader
                      fileName={item.fileName}
                      relevance={item.relevance}
                      pages={item.pages}
                      pageRelevance={item.pageRelevance}
                      fileType={item.fileType}
                      onOpenPreview={item.fileId ? () => openPreview(i) : undefined}
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
        pageRelevance={previewData?.pageRelevance}
        fileType={previewData?.fileType}
      />
    </div>
  );
}
