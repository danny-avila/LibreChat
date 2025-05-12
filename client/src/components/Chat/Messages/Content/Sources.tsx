/* eslint-disable i18next/no-literal-string */
import { AnimatedTabs } from '~/components/ui';
import { useSearchContext } from '~/Providers';
import React, { useState, useEffect } from 'react';
import * as Ariakit from '@ariakit/react';
import { Globe, Newspaper, Image, FilePlus, Plus } from 'lucide-react';
import { OGDialog, OGDialogContent, OGDialogTitle } from '~/components/ui/OriginalDialog';
import type { SearchResultData, ValidSource, ImageResult } from 'librechat-data-provider';

interface SourceItemProps {
  source: ValidSource;
  isNews?: boolean;
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

function SourceItem({ source, isNews }: SourceItemProps) {
  const domain = getCleanDomain(source.link);

  return (
    <a
      href={source.link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-10 w-full items-center gap-2 rounded-lg bg-surface-secondary px-3 py-2 text-sm transition-all duration-300 hover:bg-surface-tertiary"
    >
      <div className="relative size-4 flex-shrink-0 overflow-hidden rounded-full">
        <div className="absolute inset-0 rounded-full bg-surface-primary"></div>
        <img src={getFaviconUrl(domain)} alt={domain} className="relative size-full" />
        <div className="border-border-light/10 absolute inset-0 rounded-full border dark:border-transparent"></div>
      </div>
      <span className="text-token-text-primary max-w-full truncate font-medium">{domain}</span>
    </a>
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

function SourcesGroup({ sources, limit = 3 }: { sources: ValidSource[]; limit?: number }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const visibleSources = sources.slice(0, limit);
  const remainingSources = sources.slice(limit);
  const hasMoreSources = remainingSources.length > 0;

  // Calculate grid columns based on number of items (including the +X sources button if present)
  const totalItems = hasMoreSources ? visibleSources.length + 1 : visibleSources.length;
  const gridCols = `grid-cols-${Math.min(totalItems, 4)}`;

  return (
    <div className={`grid ${gridCols} scrollbar-none w-full gap-2 overflow-x-auto`}>
      {visibleSources.map((source, i) => (
        <div key={`source-${i}`} className="w-full min-w-[120px]">
          <SourceItem source={source} />
        </div>
      ))}
      {hasMoreSources && (
        <div className="w-full min-w-[120px]">
          <button
            onClick={() => setDialogOpen(true)}
            className="flex h-10 w-full items-center gap-1.5 rounded-lg bg-surface-secondary px-3 py-2 text-sm text-text-secondary transition-all duration-300 hover:bg-surface-tertiary"
          >
            <div className="relative flex">
              {remainingSources.slice(0, 3).map((source, i) => (
                <div
                  key={`icon-${i}`}
                  className="relative size-4 overflow-hidden rounded-full"
                  style={{ marginLeft: i > 0 ? '-6px' : '0' }}
                >
                  <div className="absolute inset-0 rounded-full bg-surface-primary"></div>
                  <img
                    src={getFaviconUrl(getCleanDomain(source.link))}
                    alt=""
                    className="relative size-full"
                  />
                  <div className="border-border-light/10 absolute inset-0 rounded-full border dark:border-transparent"></div>
                </div>
              ))}
            </div>
            <span className="max-w-full truncate font-medium">
              +{remainingSources.length} sources
            </span>
          </button>
        </div>
      )}

      {hasMoreSources && (
        <OGDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <OGDialogContent className="max-h-[80vh] max-w-full overflow-y-auto bg-surface-primary dark:border-gray-700 md:max-w-[600px]">
            <OGDialogTitle className="mb-4 text-lg font-medium">All Sources</OGDialogTitle>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {[...visibleSources, ...remainingSources].map((source, i) => (
                <div key={`more-source-${i}`} className="w-full">
                  <SourceItem source={source} />
                </div>
              ))}
            </div>
          </OGDialogContent>
        </OGDialog>
      )}
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
        content: <SourcesGroup sources={result.topStories} limit={6} />,
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
