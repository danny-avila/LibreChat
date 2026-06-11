import { memo, useState, useContext, useCallback, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useToastContext } from '@librechat/client';
import type { CitationProps } from './types';
import { SourceHovercard, FaviconImage, getCleanDomain } from '~/components/Web/SourceHovercard';
import { CitationContext, useCitation, useCompositeCitations } from './Context';
import { useFileDownload } from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';

type BklImanageLinks = {
  imanageUrl: string | null;
  imanageFolderUrl: string | null;
  bimsUrl: string | null;
};

function metadataRecords(source?: Record<string, unknown> | null): Array<Record<string, unknown>> {
  if (!source) return [];
  const metadata = source.metadata;
  if (Array.isArray(metadata)) {
    return metadata.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  }
  if (metadata && typeof metadata === 'object') {
    return [metadata as Record<string, unknown>];
  }
  return [];
}

function getImanageUrl(source?: Record<string, unknown> | null): string | null {
  if (!source) return null;
  const direct =
    typeof source.imanage_url === 'string'
      ? source.imanage_url
      : typeof source.imanage_preview_url === 'string'
        ? source.imanage_preview_url
        : null;
  if (direct) return direct;

  for (const metadata of metadataRecords(source)) {
    if (typeof metadata.imanage_url === 'string') return metadata.imanage_url;
    if (typeof metadata.imanage_preview_url === 'string') return metadata.imanage_preview_url;
  }
  return null;
}

function getImanageFolderUrl(source?: Record<string, unknown> | null): string | null {
  if (!source) return null;
  if (typeof source.imanage_folder_url === 'string') return source.imanage_folder_url;
  for (const metadata of metadataRecords(source)) {
    if (typeof metadata.imanage_folder_url === 'string') return metadata.imanage_folder_url;
  }
  return null;
}

function getBimsUrl(source?: Record<string, unknown> | null): string | null {
  if (!source) return null;
  if (typeof source.bims_url === 'string') return source.bims_url;
  for (const metadata of metadataRecords(source)) {
    if (typeof metadata.bims_url === 'string') return metadata.bims_url;
  }
  return null;
}

function getDocId(source?: Record<string, unknown> | null): string | null {
  if (!source) return null;
  for (const metadata of metadataRecords(source)) {
    if (typeof metadata.doc_id === 'string' && metadata.doc_id) return metadata.doc_id;
  }
  if (typeof source.doc_id === 'string' && source.doc_id) return source.doc_id;

  const link = typeof source.link === 'string' ? source.link : '';
  if (!link.includes('/v1/source-files/')) return null;
  return decodeURIComponent(link.split('/v1/source-files/')[1]?.split(/[?#]/)[0] ?? '') || null;
}

async function fetchBklCitationImanageLinks(docId: string): Promise<BklImanageLinks | null> {
  const resp = await fetch(`/bkl/v1/imanage-links/${encodeURIComponent(docId)}`);
  if (!resp.ok) return null;
  const data = await resp.json();
  return {
    imanageUrl: data.imanage_url ?? data.imanage_preview_url ?? null,
    imanageFolderUrl: data.imanage_folder_url ?? null,
    bimsUrl: data.bims_url ?? null,
  };
}

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

  if (!sources || sources.length === 0) return null;
  const totalPages = sources.length;

  const getCitationLabel = () => {
    if (!sources || sources.length === 0) return localize('com_citation_source');

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
      {totalPages > 1 && (
        <span className="mb-2 flex items-center justify-between border-b border-border-heavy pb-2">
          <span className="flex gap-2">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 0}
              style={{ opacity: currentPage === 0 ? 0.5 : 1 }}
              className="flex cursor-pointer items-center justify-center border-none bg-transparent p-0 text-base"
            >
              ←
            </button>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages - 1}
              style={{ opacity: currentPage === totalPages - 1 ? 0.5 : 1 }}
              className="flex cursor-pointer items-center justify-center border-none bg-transparent p-0 text-base"
            >
              →
            </button>
          </span>
          <span className="text-xs text-text-tertiary">
            {currentPage + 1}/{totalPages}
          </span>
        </span>
      )}
      <span className="mb-2 flex items-center">
        <FaviconImage domain={getCleanDomain(currentSource.link || '')} className="mr-2" />
        <a
          href={currentSource.link}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 cursor-pointer overflow-hidden text-sm font-bold text-[#0066cc] hover:underline dark:text-blue-400 md:line-clamp-3"
        >
          {currentSource.attribution}
        </a>
      </span>
      <h4 className="mb-1.5 mt-0 text-xs text-text-primary md:text-sm">{currentSource.title}</h4>
      <p className="my-2 text-ellipsis break-all text-xs text-text-secondary md:text-sm">
        {currentSource.snippet}
      </p>
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
  const user = useRecoilValue(store.user);
  const { showToast } = useToastContext();
  const { citation, citationId } = props.node?.properties ?? {};
  const { setHoveredCitationId } = useContext(CitationContext);
  const refData = useCitation({
    turn: citation?.turn || 0,
    refType: citation?.refType,
    index: citation?.index || 0,
  });
  const [imanageUrl, setImanageUrl] = useState<string | null>(null);
  const [imanageFolderUrl, setImanageFolderUrl] = useState<string | null>(null);
  const [bimsUrl, setBimsUrl] = useState<string | null>(null);

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

  useEffect(() => {
    if (!refData) return;
    const source = refData as unknown as Record<string, unknown>;
    const directUrl = getImanageUrl(source);
    const directFolderUrl = getImanageFolderUrl(source);
    const directBimsUrl = getBimsUrl(source);
    setImanageUrl(directUrl);
    setImanageFolderUrl(directFolderUrl);
    setBimsUrl(directBimsUrl);

    const docId = getDocId(source);
    if (!docId || directFolderUrl) return;

    let cancelled = false;
    fetchBklCitationImanageLinks(docId)
      .then((links) => {
        if (cancelled || !links) return;
        if (links.imanageUrl) setImanageUrl(links.imanageUrl);
        if (links.imanageFolderUrl) setImanageFolderUrl(links.imanageFolderUrl);
        if (links.bimsUrl) setBimsUrl(links.bimsUrl);
      })
      .catch(() => {
        /* iManage link is optional; keep the source hovercard usable. */
      });

    return () => {
      cancelled = true;
    };
  }, [citation?.index, refData]);

  if (!refData) return null;

  const getCitationLabel = () => {
    return (
      refData.attribution ||
      refData.title ||
      getCleanDomain(refData.link || '') ||
      localize('com_citation_source')
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
      imanageUrl={imanageUrl}
      imanageFolderUrl={imanageFolderUrl}
      bimsUrl={bimsUrl}
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
