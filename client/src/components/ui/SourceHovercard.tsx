import React, { ReactNode } from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronDown } from 'lucide-react';
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
  anchorClassName?: string;
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
  anchorClassName = 'not-prose ml-1 inline-flex h-[18px] cursor-pointer items-center rounded-xl border border-border-heavy dark:border-border-medium bg-surface-secondary px-2 py-0.5 text-xs font-medium no-underline transition-colors hover:bg-surface-hover dark:hover:bg-surface-tertiary',
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
              <a
                href={source.link}
                target="_blank"
                rel="noopener noreferrer"
                className={anchorClassName}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
              >
                {label}
              </a>
            }
          />
          <Ariakit.HovercardDisclosure className="ml-0.5 rounded-full text-text-primary focus:outline-none focus:ring-2 focus:ring-ring">
            <VisuallyHidden>{localize('com_citation_more_details', { label })}</VisuallyHidden>
            <ChevronDown className="icon-sm" />
          </Ariakit.HovercardDisclosure>

          <Ariakit.Hovercard
            gutter={16}
            className="dark:shadow-lg-dark z-[999] w-[300px] rounded-xl border border-border-medium bg-surface-secondary p-3 text-text-primary shadow-lg"
            portal={true}
            unmountOnHide={true}
          >
            {children}

            {!children && (
              <>
                <span className="mb-2 flex items-center">
                  <FaviconImage domain={domain} className="mr-2" />
                  <a
                    href={source.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="not-prose cursor-pointer font-bold"
                  >
                    {source.attribution || domain}
                  </a>
                </span>

                <h4 className="mb-1.5 mt-0 text-sm text-text-primary">
                  {source.title || source.link}
                </h4>
                {source.snippet && (
                  <span className="my-2 text-sm text-text-secondary">{source.snippet}</span>
                )}
              </>
            )}
          </Ariakit.Hovercard>
        </span>
      </Ariakit.HovercardProvider>
    </span>
  );
}
