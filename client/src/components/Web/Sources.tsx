import React, { useMemo, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import * as Ariakit from '@ariakit/react';
import { VisuallyHidden } from '@ariakit/react';
import { Tools } from 'librechat-data-provider';
import { X, Globe, Newspaper, Image, ChevronDown, File, Download } from 'lucide-react';
import {
  OGDialog,
  AnimatedTabs,
  OGDialogClose,
  OGDialogTitle,
  OGDialogContent,
  OGDialogTrigger,
  useToastContext,
} from '@librechat/client';
import type { ValidSource, ImageResult } from 'librechat-data-provider';
import { FaviconImage, getCleanDomain } from '~/components/Web/SourceHovercard';
import SourcesErrorBoundary from './SourcesErrorBoundary';
import { useFileDownload } from '~/data-provider';
import { useSearchContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import store from '~/store';

interface SourceItemProps {
  source: ValidSource;
  expanded?: boolean;
}

function SourceItem({ source, expanded = false }: SourceItemProps) {
  const localize = useLocalize();
  const domain = getCleanDomain(source.link);

  if (expanded) {
    return (
      <a
        href={source.link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full flex-col rounded-lg bg-surface-primary-contrast px-3 py-2 text-sm transition-all duration-300 hover:bg-surface-tertiary"
      >
        <div className="flex items-center gap-2">
          <FaviconImage domain={domain} />
          <span className="truncate text-xs font-medium text-text-secondary">{domain}</span>
        </div>
        <div className="mt-1">
          <span className="line-clamp-2 text-sm font-medium text-text-primary md:line-clamp-3">
            {source.title || source.link}
          </span>
          {'snippet' in source && source.snippet && (
            <span className="mt-1 line-clamp-2 text-xs text-text-secondary md:line-clamp-3">
              {source.snippet}
            </span>
          )}
        </div>
      </a>
    );
  }

  return (
    <span className="not-prose relative inline-block h-full w-full">
      <Ariakit.HovercardProvider showTimeout={150} hideTimeout={150}>
        <div className="flex h-full items-center">
          <Ariakit.HovercardAnchor
            render={
              <a
                href={source.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-full w-full flex-col rounded-lg bg-surface-primary-contrast px-3 py-2 text-sm transition-all duration-300 hover:bg-surface-tertiary"
              >
                <div className="flex items-center gap-2">
                  <FaviconImage domain={domain} />
                  <span className="truncate text-xs font-medium text-text-secondary">{domain}</span>
                </div>
                <div className="mt-1">
                  <span className="line-clamp-2 text-sm font-medium text-text-primary md:line-clamp-3">
                    {source.title || source.link}
                  </span>
                </div>
              </a>
            }
          />
          <Ariakit.HovercardDisclosure className="absolute right-2 rounded-full text-text-primary focus:outline-none focus:ring-2 focus:ring-ring">
            <VisuallyHidden>
              {localize('com_citation_more_details', { label: domain })}
            </VisuallyHidden>
            <ChevronDown className="icon-sm" aria-hidden="true" />
          </Ariakit.HovercardDisclosure>

          <Ariakit.Hovercard
            gutter={16}
            className="dark:shadow-lg-dark z-[999] w-[300px] max-w-[calc(100vw-2rem)] rounded-xl border border-border-medium bg-surface-secondary p-3 text-text-primary shadow-lg"
            portal={true}
            unmountOnHide={true}
          >
            <div className="flex gap-3">
              <div className="flex-1">
                <div className="mb-2 flex items-center">
                  <FaviconImage domain={domain} className="mr-2" />
                  <a
                    href={source.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="line-clamp-2 cursor-pointer overflow-hidden text-sm font-bold text-[#0066cc] hover:underline dark:text-blue-400 md:line-clamp-3"
                  >
                    {source.attribution || domain}
                  </a>
                </div>
                <h4 className="mb-1.5 mt-0 text-xs text-text-primary md:text-sm">
                  {source.title || source.link}
                </h4>
                {'snippet' in source && source.snippet && (
                  <span className="my-2 text-ellipsis break-all text-xs text-text-secondary md:text-sm">
                    {source.snippet}
                  </span>
                )}
              </div>
              {'imageUrl' in source && source.imageUrl && (
                <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-md">
                  <img
                    src={source.imageUrl}
                    alt={source.title || localize('com_sources_image_alt')}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
            </div>
          </Ariakit.Hovercard>
        </div>
      </Ariakit.HovercardProvider>
    </span>
  );
}

function ImageItem({ image }: { image: ImageResult }) {
  const localize = useLocalize();
  return (
    <a
      href={image.imageUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group overflow-hidden rounded-lg bg-surface-secondary transition-all duration-300 hover:bg-surface-tertiary"
    >
      {image.imageUrl && (
        <div className="relative aspect-square w-full overflow-hidden">
          <img
            src={image.imageUrl}
            alt={image.title || localize('com_sources_image_alt')}
            className="size-full object-cover"
          />
          {image.title && (
            <div className="absolute bottom-0 left-0 right-0 w-full border-none bg-gray-900/80 p-1 text-xs font-medium text-white backdrop-blur-sm">
              <span className="truncate">{image.title}</span>
            </div>
          )}
        </div>
      )}
    </a>
  );
}

// Type for agent file sources (simplified for file citations)
type AgentFileSource = {
  file_id: string;
  filename: string;
  bytes?: number;
  type?: string;
  pages?: number[];
  relevance?: number;
  pageRelevance?: Record<number, number>;
  messageId: string;
  toolCallId: string;
  metadata?: any;
};

interface FileItemProps {
  file: AgentFileSource;
  messageId: string;
  conversationId: string;
  expanded?: boolean;
}

/**
 * Sorts page numbers by their relevance scores in descending order (highest first)
 */
function sortPagesByRelevance(pages: number[], pageRelevance?: Record<number, number>): number[] {
  if (!pageRelevance || Object.keys(pageRelevance).length === 0) {
    return pages; // Return original order if no relevance data
  }

  return [...pages].sort((a, b) => {
    const relevanceA = pageRelevance[a] || 0;
    const relevanceB = pageRelevance[b] || 0;
    return relevanceB - relevanceA; // Highest relevance first
  });
}

const FileItem = React.memo(function FileItem({
  file,
  messageId: _messageId,
  conversationId: _conversationId,
  expanded = false,
}: FileItemProps) {
  const localize = useLocalize();
  const user = useRecoilValue(store.user);
  const { showToast } = useToastContext();

  const { refetch: downloadFile } = useFileDownload(user?.id ?? '', file.file_id);

  // Extract error message logic to avoid duplication
  const getErrorMessage = useCallback(
    (error: any) => {
      const errorString = JSON.stringify(error);
      const errorWithResponse = error as any;
      const isLocalFileError =
        error?.message?.includes('local files') ||
        errorWithResponse?.response?.data?.error?.includes('local files') ||
        errorWithResponse?.response?.status === 403 ||
        errorString.includes('local files') ||
        errorString.includes('403');

      return isLocalFileError
        ? localize('com_sources_download_local_unavailable')
        : localize('com_sources_download_failed');
    },
    [localize],
  );

  // Check if file is from local storage
  const isLocalFile = file.metadata?.storageType === 'local';

  const handleDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Don't allow download for local files
      if (isLocalFile) {
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
        link.setAttribute('download', file.filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(stream.data);
      } catch (error) {
        console.error('Error downloading file:', error);
      }
    },
    [downloadFile, file.filename, isLocalFile, localize, showToast],
  );
  const isLoading = false;

  // Memoize file icon computation for performance
  const fileIcon = useMemo(() => {
    const fileType = file.type?.toLowerCase() || '';
    if (fileType.includes('pdf')) return '📄';
    if (fileType.includes('image')) return '🖼️';
    if (fileType.includes('text')) return '📝';
    if (fileType.includes('word') || fileType.includes('doc')) return '📄';
    if (fileType.includes('excel') || fileType.includes('sheet')) return '📊';
    if (fileType.includes('powerpoint') || fileType.includes('presentation')) return '📈';
    return '📎';
  }, [file.type]);

  // Simple aria label
  const downloadAriaLabel = localize('com_sources_download_aria_label', {
    filename: file.filename,
    status: isLoading ? localize('com_sources_downloading_status') : '',
  });
  const error = null;
  if (expanded) {
    return (
      <button
        onClick={isLocalFile ? undefined : handleDownload}
        disabled={isLoading}
        className={`flex w-full flex-col rounded-lg bg-surface-primary-contrast px-3 py-2 text-sm transition-all duration-300 disabled:opacity-50 ${
          isLocalFile ? 'cursor-default' : 'hover:bg-surface-tertiary'
        }`}
        aria-label={
          isLocalFile ? localize('com_sources_download_local_unavailable') : downloadAriaLabel
        }
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{fileIcon}</span>
          <span className="truncate text-xs font-medium text-text-secondary">
            {localize('com_sources_agent_file')}
          </span>
          {!isLocalFile && <Download className="ml-auto h-3 w-3" aria-hidden="true" />}
        </div>
        <div className="mt-1 min-w-0">
          <span className="line-clamp-2 break-all text-left text-sm font-medium text-text-primary md:line-clamp-3">
            {file.filename}
          </span>
          {file.pages && file.pages.length > 0 && (
            <span className="mt-1 line-clamp-1 text-left text-xs text-text-secondary">
              {localize('com_sources_pages')}:{' '}
              {sortPagesByRelevance(file.pages, file.pageRelevance).join(', ')}
            </span>
          )}
          {file.bytes && (
            <span className="mt-1 line-clamp-1 text-xs text-text-secondary">
              {(file.bytes / 1024).toFixed(1)} KB
            </span>
          )}
        </div>
        {error && <div className="mt-1 text-xs text-red-500">{getErrorMessage(error)}</div>}
      </button>
    );
  }

  return (
    <button
      onClick={isLocalFile ? undefined : handleDownload}
      disabled={isLoading}
      className={`flex h-full w-full flex-col rounded-lg bg-surface-primary-contrast px-3 py-2 text-sm transition-all duration-300 disabled:opacity-50 ${
        isLocalFile ? 'cursor-default' : 'hover:bg-surface-tertiary'
      }`}
      aria-label={
        isLocalFile ? localize('com_sources_download_local_unavailable') : downloadAriaLabel
      }
    >
      <div className="flex items-center gap-2">
        <span className="text-base">{fileIcon}</span>
        <span className="truncate text-xs font-medium text-text-secondary">
          {localize('com_sources_agent_file')}
        </span>
        {!isLocalFile && <Download className="ml-auto h-3 w-3" aria-hidden="true" />}
      </div>
      <div className="mt-1 min-w-0">
        <span className="line-clamp-2 break-all text-left text-sm font-medium text-text-primary md:line-clamp-3">
          {file.filename}
        </span>
        {file.pages && file.pages.length > 0 && (
          <span className="mt-1 line-clamp-1 text-left text-xs text-text-secondary">
            {localize('com_sources_pages')}:{' '}
            {sortPagesByRelevance(file.pages, file.pageRelevance).join(', ')}
          </span>
        )}
      </div>
      {error && <div className="mt-1 text-xs text-red-500">{getErrorMessage(error)}</div>}
    </button>
  );
});

export function StackedFavicons({
  sources,
  start = 0,
  end = 3,
}: {
  sources: ValidSource[];
  start?: number;
  end?: number;
}) {
  let slice = [start, end];
  if (start < 0) {
    slice = [start];
  }
  return (
    <div className="relative flex">
      {sources.slice(...slice).map((source, i) => (
        <FaviconImage
          key={`icon-${i}`}
          domain={getCleanDomain(source.link)}
          className={i > 0 ? 'ml-[-6px]' : ''}
        />
      ))}
    </div>
  );
}

const SourcesGroup = React.memo(function SourcesGroup({
  sources,
  limit = 3,
}: {
  sources: ValidSource[];
  limit?: number;
}) {
  const localize = useLocalize();

  // Memoize source slicing for better performance
  const { visibleSources, remainingSources, hasMoreSources } = useMemo(() => {
    const visible = sources.slice(0, limit);
    const remaining = sources.slice(limit);
    return {
      visibleSources: visible,
      remainingSources: remaining,
      hasMoreSources: remaining.length > 0,
    };
  }, [sources, limit]);

  return (
    <div className="scrollbar-none grid w-full grid-cols-4 gap-2 overflow-x-auto">
      <OGDialog>
        {visibleSources.map((source, i) => (
          <div key={`source-${i}`} className="w-full min-w-[120px]">
            <SourceItem source={source} />
          </div>
        ))}
        {hasMoreSources && (
          <OGDialogTrigger className="flex flex-col rounded-lg bg-surface-primary-contrast px-3 py-2 text-sm transition-all duration-300 hover:bg-surface-tertiary">
            <div className="flex items-center gap-2">
              <StackedFavicons sources={remainingSources} />
              <span className="truncate text-xs font-medium text-text-secondary">
                {localize('com_sources_more_sources', { count: remainingSources.length })}
              </span>
            </div>
          </OGDialogTrigger>
        )}
        <OGDialogContent className="flex max-h-[80vh] max-w-full flex-col overflow-hidden rounded-lg bg-surface-primary p-0 md:max-w-[600px]">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-light bg-surface-primary px-3 py-2">
            <OGDialogTitle className="text-base font-medium">
              {localize('com_sources_title')}
            </OGDialogTitle>
            <OGDialogClose
              className="rounded-full p-1 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
              aria-label={localize('com_ui_close')}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </OGDialogClose>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <div className="flex flex-col gap-2">
              {[...visibleSources, ...remainingSources].map((source, i) => (
                <a
                  key={`more-source-${i}`}
                  href={source.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-surface-tertiary"
                >
                  <FaviconImage
                    domain={getCleanDomain(source.link)}
                    className="h-5 w-5 flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="mb-0.5 truncate text-sm font-medium text-text-primary">
                      {source.title || source.link}
                    </h3>
                    {'snippet' in source && source.snippet && (
                      <p className="mb-1 line-clamp-2 text-xs text-text-secondary md:line-clamp-3">
                        {source.snippet}
                      </p>
                    )}
                    <span className="text-xs text-text-secondary-alt">
                      {getCleanDomain(source.link)}
                    </span>
                  </div>
                  {'imageUrl' in source && source.imageUrl && (
                    <div className="hidden h-12 w-12 flex-shrink-0 overflow-hidden rounded-md sm:block">
                      <img
                        src={source.imageUrl}
                        alt={source.title || localize('com_sources_image_alt')}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                </a>
              ))}
            </div>
          </div>
        </OGDialogContent>
      </OGDialog>
    </div>
  );
});

interface FilesGroupProps {
  files: AgentFileSource[];
  messageId: string;
  conversationId: string;
  limit?: number;
}

function FilesGroup({ files, messageId, conversationId, limit = 3 }: FilesGroupProps) {
  const localize = useLocalize();
  // If there's only 1 remaining file, show it instead of "+1 files"
  const shouldShowAll = files.length <= limit + 1;
  const actualLimit = shouldShowAll ? files.length : limit;
  const visibleFiles = files.slice(0, actualLimit);
  const remainingFiles = files.slice(actualLimit);
  const hasMoreFiles = remainingFiles.length > 0;

  return (
    <div className="scrollbar-none grid w-full grid-cols-4 gap-2 overflow-x-auto">
      <OGDialog>
        {visibleFiles.map((file, i) => (
          <div key={`file-${i}`} className="w-full min-w-[120px]">
            <FileItem file={file} messageId={messageId} conversationId={conversationId} />
          </div>
        ))}
        {hasMoreFiles && (
          <OGDialogTrigger className="flex flex-col rounded-lg bg-surface-primary-contrast px-3 py-2 text-sm transition-all duration-300 hover:bg-surface-tertiary">
            <div className="flex items-center gap-2">
              <div className="relative flex">
                {remainingFiles.slice(0, 3).map((_, i) => (
                  <File key={`file-icon-${i}`} className={`h-4 w-4 ${i > 0 ? 'ml-[-6px]' : ''}`} />
                ))}
              </div>
              <span className="truncate text-xs font-medium text-text-secondary">
                {localize('com_sources_more_files', { count: remainingFiles.length })}
              </span>
            </div>
          </OGDialogTrigger>
        )}
        <OGDialogContent className="flex max-h-[80vh] max-w-full flex-col overflow-hidden rounded-lg bg-surface-primary p-0 md:max-w-[600px]">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-light bg-surface-primary px-3 py-2">
            <OGDialogTitle className="text-base font-medium">
              {localize('com_sources_agent_files')}
            </OGDialogTitle>
            <OGDialogClose
              className="rounded-full p-1 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
              aria-label={localize('com_ui_close')}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </OGDialogClose>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <div className="flex flex-col gap-2">
              {[...visibleFiles, ...remainingFiles].map((file, i) => (
                <FileItem
                  key={`more-file-${i}`}
                  file={file}
                  messageId={messageId}
                  conversationId={conversationId}
                  expanded={true}
                />
              ))}
            </div>
          </div>
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}

function TabWithIcon({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-3 py-1 text-sm transition-colors hover:bg-surface-tertiary hover:text-text-primary">
      {React.cloneElement(icon as React.ReactElement, { size: 14, 'aria-hidden': true })}
      <span>{label}</span>
    </div>
  );
}

interface SourcesProps {
  messageId?: string;
  conversationId?: string;
}

function SourcesComponent({ messageId, conversationId }: SourcesProps = {}) {
  const localize = useLocalize();
  const { searchResults } = useSearchContext();

  // Simple search results processing with good memoization
  const { organicSources, topStories, images, hasAnswerBox, agentFiles } = useMemo(() => {
    const organicSourcesMap = new Map<string, ValidSource>();
    const topStoriesMap = new Map<string, ValidSource>();
    const imagesMap = new Map<string, ImageResult>();
    const agentFilesMap = new Map<string, AgentFileSource>();
    let hasAnswerBox = false;

    if (!searchResults) {
      return {
        organicSources: [],
        topStories: [],
        images: [],
        hasAnswerBox: false,
        agentFiles: [],
      };
    }

    // Process search results
    for (const result of Object.values(searchResults)) {
      if (!result) continue;

      // Process organic sources
      result.organic?.forEach((source) => {
        if (source.link) organicSourcesMap.set(source.link, source);
      });

      // Process references
      result.references?.forEach((source) => {
        if (source.type === 'image') {
          imagesMap.set(source.link, { ...source, imageUrl: source.link });
        } else if ((source as any).type === 'file') {
          const fileId = (source as any).fileId || 'unknown';
          const fileName = source.title || 'Unknown File';
          const uniqueKey = `${fileId}_${fileName}`;

          if (agentFilesMap.has(uniqueKey)) {
            // Merge pages for the same file
            const existing = agentFilesMap.get(uniqueKey)!;
            const existingPages = existing.pages || [];
            const newPages = (source as any).pages || [];
            const uniquePages = [...new Set([...existingPages, ...newPages])].sort((a, b) => a - b);

            existing.pages = uniquePages;
            existing.relevance = Math.max(existing.relevance || 0, (source as any).relevance || 0);
            existing.pageRelevance = {
              ...existing.pageRelevance,
              ...(source as any).pageRelevance,
            };
          } else {
            const agentFile: AgentFileSource = {
              type: Tools.file_search,
              file_id: fileId,
              filename: fileName,
              bytes: undefined,
              metadata: (source as any).metadata,
              pages: (source as any).pages,
              relevance: (source as any).relevance,
              pageRelevance: (source as any).pageRelevance,
              messageId: messageId || '',
              toolCallId: 'file_search_results',
            };
            agentFilesMap.set(uniqueKey, agentFile);
          }
        } else if (source.link) {
          organicSourcesMap.set(source.link, source);
        }
      });

      // Process top stories
      result.topStories?.forEach((source) => {
        if (source.link) topStoriesMap.set(source.link, source);
      });

      // Process images
      result.images?.forEach((image) => {
        if (image.imageUrl) imagesMap.set(image.imageUrl, image);
      });

      if (result.answerBox) hasAnswerBox = true;
    }

    return {
      organicSources: Array.from(organicSourcesMap.values()),
      topStories: Array.from(topStoriesMap.values()),
      images: Array.from(imagesMap.values()),
      hasAnswerBox,
      agentFiles: Array.from(agentFilesMap.values()),
    };
  }, [searchResults, messageId]);

  const tabs = useMemo(() => {
    const availableTabs: Array<{ label: React.ReactNode; content: React.ReactNode }> = [];

    if (organicSources.length || topStories.length || hasAnswerBox) {
      availableTabs.push({
        label: <TabWithIcon label={localize('com_sources_tab_all')} icon={<Globe />} />,
        content: <SourcesGroup sources={[...organicSources, ...topStories]} />,
      });
    }

    if (topStories.length) {
      availableTabs.push({
        label: <TabWithIcon label={localize('com_sources_tab_news')} icon={<Newspaper />} />,
        content: <SourcesGroup sources={topStories} limit={3} />,
      });
    }

    if (images.length) {
      availableTabs.push({
        label: <TabWithIcon label={localize('com_sources_tab_images')} icon={<Image />} />,
        content: (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {images.map((item, i) => (
              <ImageItem key={`image-${i}`} image={item} />
            ))}
          </div>
        ),
      });
    }

    if (agentFiles.length && messageId && conversationId) {
      availableTabs.push({
        label: <TabWithIcon label={localize('com_sources_tab_files')} icon={<File />} />,
        content: (
          <FilesGroup
            files={agentFiles}
            messageId={messageId}
            conversationId={conversationId}
            limit={3}
          />
        ),
      });
    }

    return availableTabs;
  }, [
    organicSources,
    topStories,
    images,
    hasAnswerBox,
    agentFiles,
    messageId,
    conversationId,
    localize,
  ]);

  if (!tabs.length) return null;

  return (
    <div role="region" aria-label={localize('com_sources_region_label')}>
      <AnimatedTabs
        tabs={tabs}
        containerClassName="flex min-w-full mb-4"
        tabListClassName="flex items-center mb-2 border-b border-border-light overflow-x-auto"
        tabPanelClassName="w-full overflow-x-auto scrollbar-none md:mx-0 md:px-0"
        tabClassName="flex items-center whitespace-nowrap text-xs font-medium text-token-text-secondary px-1 pt-2 pb-1 border-b-2 border-transparent data-[state=active]:text-text-primary outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      />
    </div>
  );
}

// Enhanced error boundary wrapper with accessibility features
export default function Sources(props: SourcesProps) {
  const localize = useLocalize();

  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    // Log error for monitoring/analytics
    console.error('Sources component error:', { error, errorInfo });

    // Could send to error tracking service here
    // analytics.track('sources_error', { error: error.message });
  };

  const fallbackUI = (
    <div
      className="flex flex-col items-center justify-center rounded-lg border border-border-medium bg-surface-secondary p-4 text-center"
      role="alert"
      aria-live="polite"
    >
      <div className="mb-2 text-sm text-text-secondary">
        {localize('com_sources_error_fallback')}
      </div>
      <button
        onClick={() => window.location.reload()}
        className="hover:bg-surface-primary-hover rounded-md bg-surface-primary px-3 py-1 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label={localize('com_sources_reload_page')}
      >
        {localize('com_ui_refresh')}
      </button>
    </div>
  );

  return (
    <SourcesErrorBoundary
      onError={handleError}
      fallback={fallbackUI}
      showDetails={process.env.NODE_ENV === 'development'}
    >
      <SourcesComponent {...props} />
    </SourcesErrorBoundary>
  );
}
