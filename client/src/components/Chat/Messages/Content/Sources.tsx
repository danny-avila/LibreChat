/* eslint-disable i18next/no-literal-string */
import { AnimatedTabs } from '~/components/ui';
import { useSearchContext } from '~/Providers';
import React, { useState, useEffect } from 'react';
import { Globe, Newspaper, Image } from 'lucide-react';
import {
  OGDialog,
  OGDialogTitle,
  OGDialogContent,
  OGDialogTrigger,
} from '~/components/ui/OriginalDialog';
import type { ValidSource, ImageResult } from 'librechat-data-provider';

interface SourceItemProps {
  source: ValidSource;
  isNews?: boolean;
  expanded?: boolean;
}

// Helper to get domain favicon
function getFaviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

// Helper to get clean domain name
function getCleanDomain(url: string) {
  const domain = url.replace(/(^\w+:|^)\/\//, '').split('/')[0];
  return domain.startsWith('www.') ? domain.substring(4) : domain;
}

function FaviconImage({ domain, className = '' }: { domain: string; className?: string }) {
  return (
    <div className={`relative size-4 flex-shrink-0 overflow-hidden rounded-full ${className}`}>
      <div className="absolute inset-0 rounded-full bg-white" />
      <img src={getFaviconUrl(domain)} alt={domain} className="relative size-full" />
      <div className="border-border-light/10 absolute inset-0 rounded-full border dark:border-transparent"></div>
    </div>
  );
}

function SourceItemBase({
  source,
  expanded = false,
  children,
}: {
  source: ValidSource;
  expanded?: boolean;
  children: (domain: string) => React.ReactNode;
}) {
  const domain = getCleanDomain(source.link);

  return (
    <a
      href={source.link}
      target="_blank"
      rel="noopener noreferrer"
      className={
        expanded
          ? 'group flex w-full cursor-pointer items-stretch rounded-lg bg-surface-secondary p-3 transition-all duration-300 hover:bg-surface-tertiary'
          : 'flex h-10 w-full items-center gap-2 rounded-lg bg-surface-secondary px-3 py-2 text-sm transition-all duration-300 hover:bg-surface-tertiary'
      }
    >
      {children(domain)}
    </a>
  );
}

function SourceItem({ source, isNews, expanded = false }: SourceItemProps) {
  if (expanded) {
    return (
      <SourceItemBase source={source} expanded>
        {(domain) => (
          <div className="flex w-full flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <FaviconImage domain={domain} />
              <span className="text-token-text-secondary text-xs font-medium">{domain}</span>
            </div>
            <h3 className="text-token-text-primary text-sm font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400">
              {source.title || source.link}
            </h3>
            {source.snippet && (
              <p className="text-token-text-secondary mt-1 line-clamp-2 text-xs">
                {source.snippet}
              </p>
            )}
          </div>
        )}
      </SourceItemBase>
    );
  }

  return (
    <SourceItemBase source={source}>
      {(domain) => (
        <>
          <FaviconImage domain={domain} />
          <span className="max-w-full truncate text-xs font-medium text-text-primary">
            {domain}
          </span>
        </>
      )}
    </SourceItemBase>
  );
}

function ImageItem({ image }: { image: ImageResult }) {
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
            alt={image.title || 'Search result image'}
            className="size-full object-cover"
          />
          {image.title && (
            <div className="bg-surface-secondary/80 text-token-text-primary absolute bottom-0 left-0 right-0 p-1 text-xs font-medium backdrop-blur-sm">
              <p className="truncate">{image.title}</p>
            </div>
          )}
        </div>
      )}
    </a>
  );
}

function StackedFavicons({ sources }: { sources: ValidSource[] }) {
  return (
    <div className="relative flex">
      {sources.slice(0, 3).map((source, i) => (
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
  const visibleSources = sources.slice(0, limit);
  const remainingSources = sources.slice(limit);
  const hasMoreSources = remainingSources.length > 0;

  // Calculate grid columns based on number of items (including the +X sources button if present)
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
          <div className="w-full min-w-[120px]">
            <OGDialogTrigger className="flex h-10 w-full items-center gap-1.5 rounded-lg bg-surface-secondary px-3 py-2 text-sm text-text-secondary transition-all duration-300 hover:bg-surface-tertiary">
              <StackedFavicons sources={remainingSources} />
              <span className="max-w-full truncate font-medium">
                +{remainingSources.length} sources
              </span>
            </OGDialogTrigger>
          </div>
        )}
        <OGDialogContent className="max-h-[80vh] max-w-full overflow-y-auto bg-surface-primary dark:border-gray-700 md:max-w-[600px]">
          <OGDialogTitle className="mb-4 text-lg font-medium">All Sources</OGDialogTitle>
          <div className="flex flex-col gap-3">
            {[...visibleSources, ...remainingSources].map((source, i) => (
              <SourceItem key={`more-source-${i}`} source={source} expanded />
            ))}
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
  const { searchResults } = useSearchContext();
  const [tabs, setTabs] = useState<Array<{ label: React.ReactNode; content: React.ReactNode }>>([]);

  useEffect(() => {
    if (!searchResults) return;
    const latestTurn = Object.keys(searchResults)
      .map(Number)
      .sort((a, b) => b - a)[0];
    if (!latestTurn || isNaN(latestTurn)) return;
    const result = searchResults[latestTurn];
    if (!result) return;
    const availableTabs: Array<{ label: React.ReactNode; content: React.ReactNode }> = [];
    if (result.organic?.length || result.topStories?.length || result.answerBox) {
      availableTabs.push({
        label: <TabWithIcon label="All" icon={<Globe />} />,
        content: <SourcesGroup sources={result.organic?.concat(result.topStories ?? []) ?? []} />,
      });
    }
    if (result.topStories?.length) {
      availableTabs.push({
        label: <TabWithIcon label="News" icon={<Newspaper />} />,
        content: <SourcesGroup sources={result.topStories} limit={3} />,
      });
    }
    if (result.images?.length) {
      availableTabs.push({
        label: <TabWithIcon label="Images" icon={<Image />} />,
        content: (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {result.images.map((item, i) => (
              <ImageItem key={`image-${i}`} image={item} />
            ))}
          </div>
        ),
      });
    }
    setTabs(availableTabs);
  }, [searchResults]);

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
