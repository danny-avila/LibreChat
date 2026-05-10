import React, { ReactNode } from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronDown, FileText } from 'lucide-react';
import { VisuallyHidden } from '@ariakit/react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export interface SourceData {
  link: string;
  title?: string;
  attribution?: string;
  snippet?: string;
}

interface SourceHovercardProps {
  source: SourceData;
  label: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClick?: (e: React.MouseEvent) => void;
  isFile?: boolean;
  isLocalFile?: boolean;
  children?: ReactNode;
  filePages?: number[];
  fileRelevance?: number;
}

function getFaviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

export function getCleanDomain(url: string) {
  const domain = url.replace(/(^\w+:|^)\/\//, '').split('/')[0];
  return domain.startsWith('www.') ? domain.substring(4) : domain;
}

export function FaviconImage({ domain, className = '' }: { domain: string; className?: string }) {
  return (
    <img
      src={getFaviconUrl(domain)}
      alt={domain}
      className={cn('size-4 shrink-0 rounded-full', className)}
      loading="lazy"
    />
  );
}

const hovercardClass = cn(
  'z-[999] w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-border-medium bg-surface-secondary p-3 text-text-primary shadow-lg',
  'origin-top -translate-y-1 opacity-0 transition-[opacity,transform] duration-150 ease-out',
  'data-[enter]:translate-y-0 data-[enter]:opacity-100',
  'data-[leave]:-translate-y-1 data-[leave]:opacity-0',
);

function FileHovercardContent({
  source,
  onClick,
  filePages,
  fileRelevance,
}: {
  source: SourceData;
  onClick?: (e: React.MouseEvent) => void;
  filePages?: number[];
  fileRelevance?: number;
}) {
  const localize = useLocalize();
  const fileName = source.attribution || source.title || localize('com_file_source');

  return (
    <>
      <div className="flex items-center gap-2">
        <FileText className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <button
          onClick={onClick}
          className="min-w-0 truncate text-sm font-medium text-text-primary hover:underline"
        >
          {fileName}
        </button>
      </div>
      {(fileRelevance != null || (filePages && filePages.length > 0)) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {fileRelevance != null && fileRelevance > 0 && (
            <span className="text-xs text-text-secondary">
              {localize('com_ui_relevance')}: {Math.round(fileRelevance * 100)}%
            </span>
          )}
          {filePages && filePages.length > 0 && (
            <span className="text-xs text-text-secondary">
              {localize('com_file_pages', { pages: filePages.join(', ') })}
            </span>
          )}
        </div>
      )}
      {source.snippet && (
        <p className="mt-1.5 line-clamp-3 break-words text-xs leading-relaxed text-text-secondary">
          {source.snippet}
        </p>
      )}
    </>
  );
}

export function SourceHovercard({
  source,
  label,
  onMouseEnter,
  onMouseLeave,
  onClick,
  isFile = false,
  isLocalFile = false,
  children,
  filePages,
  fileRelevance,
}: SourceHovercardProps) {
  const localize = useLocalize();
  const domain = getCleanDomain(source.link || '');
  const hovercard = Ariakit.useHovercardStore({ showTimeout: 150, hideTimeout: 150 });

  const handleFileClick = React.useCallback(
    (e: React.MouseEvent) => {
      hovercard.hide();
      onClick?.(e);
    },
    [hovercard, onClick],
  );

  return (
    <span className="relative ml-0.5 inline-block">
      <Ariakit.HovercardProvider store={hovercard}>
        <span className="flex items-center">
          <Ariakit.HovercardAnchor
            render={
              isFile ? (
                <button
                  onClick={handleFileClick}
                  className="ml-1 inline-flex h-5 max-w-36 items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-xl border border-border-heavy bg-surface-secondary px-2 text-xs font-medium text-text-primary no-underline transition-colors hover:bg-surface-hover dark:border-border-medium dark:hover:bg-surface-tertiary"
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                  title={
                    isLocalFile ? localize('com_sources_download_local_unavailable') : undefined
                  }
                >
                  <FileText className="size-2.5 shrink-0 text-text-secondary" aria-hidden="true" />
                  {label}
                </button>
              ) : (
                <a
                  href={source.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 inline-block h-5 max-w-36 cursor-pointer items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-xl border border-border-heavy bg-surface-secondary px-2 text-xs font-medium no-underline transition-colors hover:bg-surface-hover dark:border-border-medium dark:hover:bg-surface-tertiary"
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                >
                  {label}
                </a>
              )
            }
          />
          <Ariakit.HovercardDisclosure className="ml-0.5 rounded-full text-text-primary focus:outline-none focus:ring-2 focus:ring-ring">
            <VisuallyHidden>{localize('com_citation_more_details', { label })}</VisuallyHidden>
            <ChevronDown className="icon-sm" aria-hidden="true" />
          </Ariakit.HovercardDisclosure>

          <Ariakit.Hovercard
            gutter={16}
            className={hovercardClass}
            portal={true}
            unmountOnHide={true}
          >
            <div>
              {children ??
                (isFile ? (
                  <FileHovercardContent
                    source={source}
                    onClick={handleFileClick}
                    filePages={filePages}
                    fileRelevance={fileRelevance}
                  />
                ) : (
                  <>
                    <div className="mb-1.5 overflow-hidden text-sm">
                      <FaviconImage domain={domain} className="float-left mr-2 mt-0.5" />
                      <span className="float-right ml-2 max-w-[40%] truncate text-xs text-text-secondary">
                        {domain}
                      </span>
                      <a
                        href={source.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-text-primary hover:underline"
                      >
                        {source.title || source.link}
                      </a>
                    </div>
                    {source.snippet && (
                      <p className="line-clamp-4 break-words text-xs text-text-secondary md:text-sm">
                        {source.snippet}
                      </p>
                    )}
                  </>
                ))}
            </div>
          </Ariakit.Hovercard>
        </span>
      </Ariakit.HovercardProvider>
    </span>
  );
}
