import React, { memo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '~/utils';

interface SuggestionCardProps {
  icon: LucideIcon;
  title: string;
  onClick: () => void;
}

function SuggestionCard({ icon: Icon, title, onClick }: SuggestionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border-medium px-3 py-2 text-sm text-text-primary',
        'transition-colors duration-200 ease-in-out',
        'hover:bg-surface-tertiary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
      )}
    >
      <Icon className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
      <span>{title}</span>
    </button>
  );
}

export default memo(SuggestionCard);
