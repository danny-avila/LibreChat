import React, { ReactNode } from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronDown, Paperclip } from 'lucide-react';
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
}

/** Helper to get domain favicon */
function getFaviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

/** Helper to get clean domain name */
export function getCleanDomain(url: string) {
  const domain = url.replace(/(^\w+:|^)\/\//, '').split('/')[0];
  return domain.startsWith('www.') ? domain.substring(4) : domain;
}

export function FaviconImage({ domain, className = '' }: { domain: string; className?: string }) {
  return (
    <div className={cn('relative size-4 flex-shrink-0 overflow-hidden rounded-full', className)}>
      <div className="absolute inset-0 rounded-full bg-white" />
      <img src={getFaviconUrl(domain)} alt={domain} className="relative size-full" />
      <div className="border-border-light/10 absolute inset-0 rounded-full border dark:border-transparent"></div>
    </div>
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
}: SourceHovercardProps) {
  const localize = useLocalize();
  const domain = getCleanDomain(source.link || '');

  return (
    <span className="relative ml-0.5 inline-block">
      <Ariakit.HovercardProvider showTimeout={150} hideTimeout={150}>
        <span className="flex items-center">
          <Ariakit.HovercardAnchor
            render={
              isFile ? (
                <button
                  onClick={onClick}
                  className="ml-0.5 inline-flex h-5 max-w-36 cursor-pointer items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap rounded bg-surface-tertiary px-1.5 text-xs font-medium text-text-secondary no-underline transition-colors hover:bg-surface-hover hover:text-text-primary dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                  title={
                    isLocalFile ? localize('com_sources_download_local_unavailable') : undefined
                  }
                >
                  {label}
                </button>
              ) : (
                <a
                  href={source.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-0.5 inline-flex h-5 max-w-36 cursor-pointer items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap rounded bg-surface-tertiary px-1.5 text-xs font-medium !text-text-secondary !no-underline transition-colors hover:bg-surface-hover hover:!text-text-primary dark:bg-gray-700 dark:!text-gray-300 dark:hover:bg-gray-600"
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
            className="dark:shadow-lg-dark z-[999] w-[300px] max-w-[calc(100vw-2rem)] rounded-xl border border-border-medium bg-surface-secondary p-3 text-text-primary shadow-lg"
            portal={true}
            unmountOnHide={true}
          >
            {children}
            {!children && (
              <>
                {/* Domain with favicon - Perplexity style */}
                <span className="mb-1 flex items-center gap-2">
                  {isFile ? (
                    <Paperclip className="h-4 w-4 text-text-secondary" />
                  ) : (
                    <FaviconImage domain={domain} />
                  )}
                  <span className="text-xs text-text-secondary">
                    {isFile ? localize('com_file_source') : domain}
                  </span>
                </span>

                {/* Title as clickable link */}
                {isFile ? (
                  <button
                    onClick={onClick}
                    className="mb-1.5 line-clamp-2 cursor-pointer text-left text-sm font-semibold text-text-primary hover:underline"
                  >
                    {source.title || source.attribution || localize('com_file_source')}
                  </button>
                ) : (
                  <a
                    href={source.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mb-1.5 line-clamp-2 cursor-pointer text-sm font-semibold text-text-primary hover:underline"
                  >
                    {source.title || source.attribution || source.link}
                  </a>
                )}

                {/* Snippet */}
                {source.snippet && (
                  <p className="line-clamp-3 text-xs text-text-secondary">{source.snippet}</p>
                )}
              </>
            )}
          </Ariakit.Hovercard>
        </span>
      </Ariakit.HovercardProvider>
    </span>
  );
}
