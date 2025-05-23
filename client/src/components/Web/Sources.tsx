import React, { useMemo } from 'react';
import * as Ariakit from '@ariakit/react';
import { VisuallyHidden } from '@ariakit/react';
import { Globe, Newspaper, Image, ChevronDown } from 'lucide-react';
import type { ValidSource, ImageResult } from 'librechat-data-provider';
import { FaviconImage, getCleanDomain } from '~/components/Web/SourceHovercard';
import { useSearchContext } from '~/Providers';
import { AnimatedTabs } from '~/components/ui';
import { useLocalize } from '~/hooks';
import {
  OGDialog,
  OGDialogTitle,
  OGDialogContent,
  OGDialogTrigger,
} from '~/components/ui/OriginalDialog';

interface SourceItemProps {
  source: ValidSource;
  isNews?: boolean;
  expanded?: boolean;
}

function SourceItem({ source, isNews, expanded = false }: SourceItemProps) {
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
                  {/* {'snippet' in source && source.snippet && (
                    <span className="mt-1 line-clamp-2 md:line-clamp-3 text-xs text-text-secondary">
                      {source.snippet}
                    </span>
                  )} */}
                </div>
              </a>
            }
          />
          <Ariakit.HovercardDisclosure className="absolute right-2 rounded-full text-text-primary focus:outline-none focus:ring-2 focus:ring-ring">
            <VisuallyHidden>
              {localize('com_citation_more_details', { label: domain })}
            </VisuallyHidden>
            <ChevronDown className="icon-sm" />
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

function SourcesGroup({ sources, limit = 3 }: { sources: ValidSource[]; limit?: number }) {
  const localize = useLocalize();
  const visibleSources = sources.slice(0, limit);
  const remainingSources = sources.slice(limit);
  const hasMoreSources = remainingSources.length > 0;

  /** Calculate grid columns based on number of items (including the +X sources button if present) */
  const totalItems = hasMoreSources ? visibleSources.length + 1 : visibleSources.length;
  const gridCols = `grid-cols-${Math.min(totalItems, 4)}`;

  return (
    <div className={`grid ${gridCols} scrollbar-none w-full gap-2 overflow-x-auto`}>
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
            <button
              className="rounded-full p-1 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
              aria-label={localize('com_ui_close')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
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
}

function TabWithIcon({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-3 py-1 text-sm transition-colors hover:bg-surface-tertiary hover:text-text-primary">
      {React.cloneElement(icon as React.ReactElement, { size: 14 })}
      <span>{label}</span>
    </div>
  );
}

export default function Sources() {
  const localize = useLocalize();
  const { searchResults } = useSearchContext();

  const { organicSources, topStories, images, hasAnswerBox } = useMemo(() => {
    if (!searchResults) {
      return {
        organicSources: [],
        topStories: [],
        images: [],
        hasAnswerBox: false,
      };
    }

    const organicSourcesMap = new Map<string, ValidSource>();
    const topStoriesMap = new Map<string, ValidSource>();
    const imagesMap = new Map<string, ImageResult>();
    let hasAnswerBox = false;

    Object.values(searchResults).forEach((result) => {
      if (!result) return;

      if (result.organic?.length) {
        result.organic.forEach((source) => {
          if (source.link) {
            organicSourcesMap.set(source.link, source);
          }
        });
      }
      if (result.references?.length) {
        result.references.forEach((source) => {
          if (source.type === 'image') {
            imagesMap.set(source.link, {
              ...source,
              imageUrl: source.link,
            });
            return;
          }
          if (source.link) {
            organicSourcesMap.set(source.link, source);
          }
        });
      }
      if (result.topStories?.length) {
        result.topStories.forEach((source) => {
          if (source.link) {
            topStoriesMap.set(source.link, source);
          }
        });
      }
      if (result.images?.length) {
        result.images.forEach((image) => {
          if (image.imageUrl) {
            imagesMap.set(image.imageUrl, image);
          }
        });
      }
      if (result.answerBox) {
        hasAnswerBox = true;
      }
    });

    return {
      organicSources: Array.from(organicSourcesMap.values()),
      topStories: Array.from(topStoriesMap.values()),
      images: Array.from(imagesMap.values()),
      hasAnswerBox,
    };
  }, [searchResults]);

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

    return availableTabs;
  }, [organicSources, topStories, images, hasAnswerBox, localize]);

  if (!tabs.length) return null;

  return (
    <AnimatedTabs
      tabs={tabs}
      containerClassName="flex min-w-full mb-4"
      tabListClassName="flex items-center mb-2 border-b border-border-light overflow-x-auto"
      tabPanelClassName="w-full overflow-x-auto scrollbar-none md:mx-0 md:px-0"
      tabClassName="flex items-center whitespace-nowrap text-xs font-medium text-token-text-secondary px-1 pt-2 pb-1 border-b-2 border-transparent data-[state=active]:text-text-primary outline-none"
    />
  );
}
