import React, { useState, useEffect } from 'react';
import { cn } from '~/utils';
import { Skeleton } from '~/components/ui/Skeleton';
import type { TMessage } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

type Citation = {
  url: string;
  displayName: string;
  favicon: string;
  index: number;
  imageLoaded?: boolean;
};

interface SourcesDisplayProps {
  message?: TMessage;
}

const SourcesDisplay: React.FC<SourcesDisplayProps> = ({ message }) => {
  const [citations, setCitations] = useState<Citation[]>([]);
  const [activeTab, setActiveTab] = useState<'preview' | 'sources'>('preview');
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const localize = useLocalize();

  useEffect(() => {
    if (message?.citations && message.citations.length > 0) {
      const processedCitations = message.citations.map((citation: string, index: number) => {
        let displayName = citation;
        let favicon = '';

        try {
          const urlObj = new URL(citation);
          displayName = urlObj.hostname;
          favicon = `https://www.google.com/s2/favicons?domain=${displayName}&sz=64`;
        } catch (e) {
          // URL invalide, on garde la citation telle quelle
        }

        return {
          url: citation,
          displayName,
          favicon,
          index: index + 1,
          imageLoaded: false,
        };
      });

      setCitations(processedCitations);
    } else {
      setCitations([]);
    }
  }, [message]);

  const handleImageLoad = (index: number) => {
    setCitations(prev =>
      prev.map((citation, i) =>
        i === index ? { ...citation, imageLoaded: true } : citation
      )
    );
  };

  if (!citations.length) {
    return null;
  }

  const sourceCount = citations.length;
  const previewSources = citations.slice(0, 4);
  const hasMoreSources = sourceCount > 4;
  const additionalSources = citations.slice(4);
  const faviconsToShow = additionalSources.slice(0, 3);

  return (
    <div className="mb-3 mt-2 border-b border-border-light pb-2">
      <div className="flex items-center space-x-1 text-sm">
        <button
          onClick={() => {
            setActiveTab('preview');
            setIsOpen(true);
          }}
          className={cn(
            'px-3 py-1 transition-colors',
            activeTab === 'preview' ? 'text-primary border-b-2 border-primary' : 'text-primary-light hover:text-primary'
          )}
        >
          {localize('com_ui_search')}
        </button>

        <button
          onClick={() => {
            setActiveTab('sources');
            setIsOpen(true);
          }}
          className={cn(
            'px-3 py-1 flex items-center gap-2 transition-colors',
            activeTab === 'sources' ? 'text-primary border-b-2 border-primary' : 'text-primary-light hover:text-primary'
          )}
        >
          <span>{localize('com_ui_sources')}</span>
          <span className="px-1.5 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
            {sourceCount}
          </span>
        </button>
      </div>

      {isOpen && (
        <div className="mt-2 px-1">
          {activeTab === 'preview' ? (
            <div className="flex flex-wrap items-center gap-2">
              {previewSources.map((citation, index) => (
                <a
                  key={index}
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-400/60 hover:bg-gray-200 dark:hover:bg-gray-700/70 transition-colors"
                >
                  <div className="w-4 h-4 flex-shrink-0 relative">
                    {citation.favicon && !citation.imageLoaded && (
                      <Skeleton className="w-4 h-4 absolute inset-0 rounded-lg" />
                    )}
                    {citation.favicon ? (
                      <img
                        src={citation.favicon}
                        alt=""
                        className={cn(
                          'w-4 h-4 flex-shrink-0',
                          !citation.imageLoaded && 'opacity-0'
                        )}
                        onLoad={() => handleImageLoad(index)}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.onerror = null;
                          target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-4 h-4 flex-shrink-0 bg-gray-300 dark:bg-gray-600 rounded-lg"></div>
                    )}
                  </div>
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[200px]">{citation.displayName}</span>
                </a>
              ))}

              {hasMoreSources && (
                <button
                  onClick={() => setActiveTab('sources')}
                  className="flex items-center gap-2 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-400/60 hover:bg-gray-200 dark:hover:bg-gray-700/70 transition-colors"
                >
                  <div className="flex items-center -space-x-1">
                    {faviconsToShow.map((citation, index) => (
                      <div key={index} className="w-4 h-4 flex-shrink-0 relative">
                        {citation.favicon && !citation.imageLoaded && (
                          <Skeleton className="w-4 h-4 absolute inset-0 rounded-lg border border-white dark:border-gray-800" />
                        )}
                        {citation.favicon ? (
                          <img
                            src={citation.favicon}
                            alt=""
                            className={cn(
                              'w-4 h-4 flex-shrink-0 border border-white dark:border-gray-800 rounded-full',
                              !citation.imageLoaded && 'opacity-0'
                            )}
                            onLoad={() => handleImageLoad(index + previewSources.length)}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.onerror = null;
                              target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-4 h-4 flex-shrink-0 bg-gray-300 dark:bg-gray-600 rounded-full border border-white dark:border-gray-800"></div>
                        )}
                      </div>
                    ))}
                  </div>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">+{sourceCount - 4}{localize('com_ui_sources')}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1">
              {citations.map((citation, index) => (
                <div key={index} className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-gray-100 dark:bg-gray-600/60 hover:bg-gray-200 dark:hover:bg-gray-700/70 transition-colors">
                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300">
                    {citation.index}
                  </div>
                  <div className="flex items-center flex-1 overflow-hidden">
                    <div className="w-4 h-4 mr-2 flex-shrink-0 relative">
                      {citation.favicon && !citation.imageLoaded && (
                        <Skeleton className="w-4 h-4 absolute inset-0 rounded-full" />
                      )}
                      {citation.favicon ? (
                        <img
                          src={citation.favicon}
                          alt=""
                          className={cn(
                            "w-4 h-4 flex-shrink-0",
                            !citation.imageLoaded && "opacity-0"
                          )}
                          onLoad={() => handleImageLoad(index)}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.onerror = null;
                            target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-4 h-4 flex-shrink-0 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
                      )}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{citation.displayName}</span>
                      <a 
                        href={citation.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate"
                      >
                        {citation.url}
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SourcesDisplay;