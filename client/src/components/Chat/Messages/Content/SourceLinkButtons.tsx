import React from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '~/utils';

/**
 * Shared external-source link buttons (iM 파일 / iM 폴더 / BIMS …).
 *
 * Originally these lived privately inside `BklSourcesPanel.tsx` as
 * `PanelExternalLink` / `PanelDisabledLink` / `PanelPopupLink`. The document
 * search `ResultCard` rendered its own near-duplicate markup, so the two
 * surfaces drifted (different hover colours, missing disabled states). They
 * now share this component so the chat citation panel and the document search
 * cards render identical link affordances.
 *
 * `size="md"` reproduces the citation panel chrome (h-8 / text-xs); `size="sm"`
 * matches the more compact document-search card row (h-7 / text-[11px]).
 */

export type SourceLinkSize = 'sm' | 'md';

const sizeClass: Record<SourceLinkSize, string> = {
  sm: 'h-7 text-[11px]',
  md: 'h-8 text-xs',
};

const interactiveClass = cn(
  'inline-flex items-center gap-1 rounded-md px-2 text-text-secondary',
  'hover:bg-surface-hover hover:text-text-primary',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-medium',
);

const BIMS_POPUP_FEATURES =
  'width=1000,height=800,menubar=no,toolbar=no,location=yes,status=no,scrollbars=yes,resizable=yes';

interface BaseLinkProps {
  label: string;
  size?: SourceLinkSize;
  /** Add `shrink-0` so the button keeps its width inside flex rows. */
  shrink?: boolean;
  /** Stop click propagation (needed when nested inside a clickable card). */
  stopPropagation?: boolean;
}

export function SourceExternalLink({
  href,
  label,
  size = 'md',
  shrink = false,
  stopPropagation = false,
}: BaseLinkProps & { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
      className={cn(interactiveClass, sizeClass[size], shrink && 'shrink-0')}
    >
      <ExternalLink size={14} aria-hidden="true" />
      <span>{label}</span>
    </a>
  );
}

export function SourceDisabledLink({ label, size = 'md', shrink = false }: BaseLinkProps) {
  return (
    <button
      type="button"
      disabled
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex cursor-not-allowed items-center gap-1 rounded-md px-2 text-text-tertiary opacity-70',
        sizeClass[size],
        shrink && 'shrink-0',
      )}
    >
      <ExternalLink size={14} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export function SourcePopupLink({
  href,
  label,
  popupName,
  size = 'md',
  shrink = false,
  stopPropagation = false,
}: BaseLinkProps & { href: string; popupName: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        window.open(href, popupName, BIMS_POPUP_FEATURES);
      }}
      className={cn(interactiveClass, sizeClass[size], shrink && 'shrink-0')}
    >
      <ExternalLink size={14} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
