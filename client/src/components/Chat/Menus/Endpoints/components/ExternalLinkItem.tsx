import React from 'react';
import { ExternalLink } from 'lucide-react';
import { CustomMenuItem as MenuItem } from '../CustomMenu';

interface ExternalLinkItemProps {
  title: string;
  url: string;
}

export function ExternalLinkItem({ title, url }: ExternalLinkItemProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <MenuItem
      value={`external-link-${title}`}
      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-tertiary"
      onClick={handleClick}
    >
      <div className="flex flex-shrink-0 items-center justify-center">
        <ExternalLink className="h-4 w-4 text-text-secondary" />
      </div>
      <span className="flex-grow truncate text-left">{title}</span>
    </MenuItem>
  );
}

export function renderExternalLinks(
  externalLinks: Array<{ title: string; url: string }>,
  headerText?: string,
) {
  if (!externalLinks || externalLinks.length === 0) {
    return null;
  }

  const displayHeader = headerText || 'Links';

  return (
    <>
      {/* Separator */}
      <div className="mx-2 my-1 border-t border-border-light" />
      {/* Links Header */}
      <div className="px-3 py-1 text-xs font-medium text-text-secondary">{displayHeader}</div>
      {/* External Links */}
      {externalLinks.map((link, index) => (
        <ExternalLinkItem key={`external-link-${index}`} title={link.title} url={link.url} />
      ))}
    </>
  );
}
