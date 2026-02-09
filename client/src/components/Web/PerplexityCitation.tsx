import { memo, useState, useContext, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useToastContext } from '@librechat/client';
import type { CitationProps } from './types';
import {
  SourceHovercard,
  FaviconImage,
  getCleanDomain,
} from '~/components/Web/PerplexitySourceHovercard';
import { CitationContext, useCitation, useCompositeCitations } from './Context';
import { useFileDownload } from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';

interface CompositeCitationProps {
  citationId?: string;
  node?: {
    properties?: CitationProps;
  };
}

export function PerplexityCompositeCitation(props: CompositeCitationProps) {
  const localize = useLocalize();
  const { citations, citationId } = props.node?.properties ?? ({} as CitationProps);
  const { setHoveredCitationId } = useContext(CitationContext);
  const [currentPage, setCurrentPage] = useState(0);
  const sources = useCompositeCitations(citations || []);

  if (!sources || sources.length === 0) return null;
  const totalPages = sources.length;

  const getCitationLabel = () => {
    if (!sources || sources.length === 0) return localize('com_citation_source');

    const firstSource = sources[0];
    const remainingCount = sources.length - 1;
    // Perplexity-style: prefer domain name for compact display
    const domain = getCleanDomain(firstSource.link || '') || localize('com_citation_source');

    return remainingCount > 0 ? `${domain} +${remainingCount}` : domain;
  };

  // Get unique domains for stacked favicon display
  const getUniqueDomains = () => {
    if (!sources) return [];
    const domains = sources.map((s) => getCleanDomain(s.link || '')).filter(Boolean);
    return [...new Set(domains)].slice(0, 3); // Max 3 favicons
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
      {totalPages > 1 && (
        <span className="mb-3 flex items-center justify-between border-b border-border-heavy pb-2">
          <span className="flex h-4 items-center gap-1">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 0}
              className={`flex h-4 w-4 -translate-y-[2.5px] items-center justify-center rounded border-none bg-transparent p-0 text-text-secondary ${currentPage === 0 ? 'cursor-default opacity-40' : 'cursor-pointer hover:bg-surface-hover hover:text-text-primary'}`}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="flex h-4 min-w-[2.5rem] -translate-y-[2.5px] items-center justify-center text-xs text-text-secondary">
              {currentPage + 1}/{totalPages}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages - 1}
              className={`flex h-4 w-4 -translate-y-[2.5px] items-center justify-center rounded border-none bg-transparent p-0 text-text-secondary ${currentPage === totalPages - 1 ? 'cursor-default opacity-40' : 'cursor-pointer hover:bg-surface-hover hover:text-text-primary'}`}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </span>
          <span className="flex h-4 items-center gap-3">
            <span className="flex -translate-y-[2.5px] -space-x-1">
              {getUniqueDomains().map((domain, i) => (
                <FaviconImage
                  key={domain}
                  domain={domain}
                  className={i > 0 ? 'ring-1 ring-surface-secondary' : ''}
                />
              ))}
            </span>
            <span className="flex h-4 -translate-y-[2.5px] items-center text-xs text-text-secondary">
              {localize('com_citation_sources_count', { count: totalPages })}
            </span>
          </span>
        </span>
      )}
      <span className="mb-1 flex items-center gap-2">
        <FaviconImage domain={getCleanDomain(currentSource.link || '')} />
        <span className="text-xs text-text-secondary">
          {getCleanDomain(currentSource.link || '')}
        </span>
      </span>
      <a
        href={currentSource.link}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-1.5 line-clamp-2 cursor-pointer text-sm font-semibold text-text-primary hover:underline"
      >
        {currentSource.title || currentSource.attribution}
      </a>
      {currentSource.snippet && (
        <p className="line-clamp-3 text-xs text-text-secondary">{currentSource.snippet}</p>
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

export function PerplexityCitation(props: CitationComponentProps) {
  const localize = useLocalize();
  const user = useRecoilValue(store.user);
  const { showToast } = useToastContext();
  const { citation, citationId } = props.node?.properties ?? {};
  const { setHoveredCitationId } = useContext(CitationContext);
  const refData = useCitation({
    turn: citation?.turn || 0,
    refType: citation?.refType,
    index: citation?.index || 0,
  });

  // Setup file download hook
  const isFileType = refData?.refType === 'file' && (refData as any)?.fileId;
  const isLocalFile = isFileType && (refData as any)?.metadata?.storageType === 'local';
  const { refetch: downloadFile } = useFileDownload(
    user?.id ?? '',
    isFileType && !isLocalFile ? (refData as any).fileId : '',
  );

  const handleFileDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!isFileType || !(refData as any)?.fileId) return;

      // Don't allow download for local files
      if (isLocalFile) {
        showToast({
          status: 'error',
          message: localize('com_sources_download_local_unavailable'),
        });
        return;
      }

      try {
        const stream = await downloadFile();
        if (stream.data == null || stream.data === '') {
          console.error('Error downloading file: No data found');
          showToast({
            status: 'error',
            message: localize('com_ui_download_error'),
          });
          return;
        }
        const link = document.createElement('a');
        link.href = stream.data;
        link.setAttribute('download', (refData as any).fileName || 'file');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(stream.data);
      } catch (error) {
        console.error('Error downloading file:', error);
        showToast({
          status: 'error',
          message: localize('com_ui_download_error'),
        });
      }
    },
    [downloadFile, isFileType, isLocalFile, refData, localize, showToast],
  );

  if (!refData) return null;

  const getCitationLabel = () => {
    // Perplexity-style: prefer domain name for compact display
    return (
      getCleanDomain(refData.link || '') || refData.attribution || localize('com_citation_source')
    );
  };

  return (
    <SourceHovercard
      source={refData}
      label={getCitationLabel()}
      onMouseEnter={() => setHoveredCitationId(citationId || null)}
      onMouseLeave={() => setHoveredCitationId(null)}
      onClick={isFileType && !isLocalFile ? handleFileDownload : undefined}
      isFile={isFileType}
      isLocalFile={isLocalFile}
    />
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

export const PerplexityHighlightedText = memo(function PerplexityHighlightedText({
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
