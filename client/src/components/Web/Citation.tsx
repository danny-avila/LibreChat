import { memo, useState, useContext, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@librechat/client';
import type { CitationProps } from './types';
import { SourceHovercard, FaviconImage, getCleanDomain } from '~/components/Web/SourceHovercard';
import FilePreviewDialog from '~/components/Chat/Messages/Content/FilePreviewDialog';
import { CitationContext, useCitation, useCompositeCitations } from './Context';
import { useLocalize } from '~/hooks';

interface CompositeCitationProps {
  citationId?: string;
  node?: {
    properties?: CitationProps;
  };
}

export function CompositeCitation(props: CompositeCitationProps) {
  const localize = useLocalize();
  const { citations, citationId } = props.node?.properties ?? ({} as CitationProps);
  const { setHoveredCitationId } = useContext(CitationContext);
  const [currentPage, setCurrentPage] = useState(0);
  const sources = useCompositeCitations(citations || []);

  if (!sources || sources.length === 0) {
    return null;
  }
  const totalPages = sources.length;

  const getCitationLabel = () => {
    if (!sources || sources.length === 0) {
      return localize('com_citation_source');
    }

    const firstSource = sources[0];
    const remainingCount = sources.length - 1;
    const attribution =
      firstSource.attribution ||
      firstSource.title ||
      getCleanDomain(firstSource.link || '') ||
      localize('com_citation_source');

    return remainingCount > 0 ? `${attribution} +${remainingCount}` : attribution;
  };

  const handlePrevPage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const currentSource = sources?.[currentPage];

  return (
    <SourceHovercard
      source={currentSource}
      label={getCitationLabel()}
      onMouseEnter={() => setHoveredCitationId(citationId || null)}
      onMouseLeave={() => setHoveredCitationId(null)}
    >
      <div className="mb-1.5 overflow-hidden text-sm">
        <FaviconImage
          domain={getCleanDomain(currentSource.link || '')}
          className="float-left mr-2 mt-0.5"
        />
        <span className="float-right ml-2 max-w-[40%] truncate text-xs text-text-secondary">
          {getCleanDomain(currentSource.link || '')}
        </span>
        <a
          href={currentSource.link}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-text-primary hover:underline"
        >
          {currentSource.title}
        </a>
      </div>
      {currentSource.snippet && (
        <p className="line-clamp-4 break-words text-xs text-text-secondary md:text-sm">
          {currentSource.snippet}
        </p>
      )}
      {totalPages > 1 && (
        <div className="flex items-center gap-1 border-t border-border-light pt-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={handlePrevPage}
            disabled={currentPage === 0}
            className="size-7"
            aria-label="Previous source"
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
          </Button>
          {sources.map((source, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrentPage(i);
              }}
              className={`flex size-6 items-center justify-center rounded text-xs transition-colors ${
                i === currentPage
                  ? 'bg-surface-hover font-medium text-text-primary'
                  : 'text-text-secondary hover:bg-surface-hover'
              }`}
              aria-label={`Source ${i + 1}`}
              aria-current={i === currentPage ? 'true' : undefined}
            >
              {i + 1}
            </button>
          ))}
          <Button
            size="icon"
            variant="ghost"
            onClick={handleNextPage}
            disabled={currentPage === totalPages - 1}
            className="size-7"
            aria-label="Next source"
          >
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}
    </SourceHovercard>
  );
}

interface CitationComponentProps {
  citationId: string;
  citationType: 'span' | 'standalone' | 'composite' | 'group' | 'navlist';
  node?: {
    properties?: CitationProps;
  };
}

export function Citation(props: CitationComponentProps) {
  const localize = useLocalize();
  const { citation, citationId } = props.node?.properties ?? {};
  const { setHoveredCitationId } = useContext(CitationContext);
  const refData = useCitation({
    turn: citation?.turn || 0,
    refType: citation?.refType,
    index: citation?.index || 0,
  });

  const fileData = refData as unknown as Record<string, unknown> | undefined;
  const isFileType = refData?.refType === 'file' && fileData?.fileId;
  const fileId = isFileType ? (fileData.fileId as string) : undefined;
  const fileName = isFileType ? (fileData.fileName as string) : undefined;
  const filePages = isFileType ? (fileData.pages as number[] | undefined) : undefined;
  const fileRelevance = isFileType ? (fileData.relevance as number | undefined) : undefined;

  const [showPreview, setShowPreview] = useState(false);

  const handleFileClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isFileType && fileId) {
        setShowPreview(true);
      }
    },
    [isFileType, fileId],
  );

  if (!refData) {
    return null;
  }

  const getCitationLabel = () => {
    return (
      refData.attribution ||
      refData.title ||
      getCleanDomain(refData.link || '') ||
      localize('com_citation_source')
    );
  };

  return (
    <>
      <SourceHovercard
        source={refData}
        label={getCitationLabel()}
        onMouseEnter={() => setHoveredCitationId(citationId || null)}
        onMouseLeave={() => setHoveredCitationId(null)}
        onClick={isFileType ? handleFileClick : undefined}
        isFile={!!isFileType}
        filePages={filePages}
        fileRelevance={fileRelevance}
      />
      {isFileType && fileId && (
        <FilePreviewDialog
          open={showPreview}
          onOpenChange={setShowPreview}
          fileName={fileName || refData.title || ''}
          fileId={fileId}
          relevance={fileRelevance}
          pages={filePages}
        />
      )}
    </>
  );
}

export interface HighlightedTextProps {
  children: React.ReactNode;
  citationId?: string;
}

export function useHighlightState(citationId: string | undefined) {
  const { hoveredCitationId } = useContext(CitationContext);
  return citationId && hoveredCitationId === citationId;
}

export const HighlightedText = memo(function HighlightedText({
  children,
  citationId,
}: HighlightedTextProps) {
  const isHighlighted = useHighlightState(citationId);

  return (
    <span
      className={`rounded px-0 py-0.5 transition-colors ${isHighlighted ? 'bg-amber-300/20' : ''}`}
    >
      {children}
    </span>
  );
});
