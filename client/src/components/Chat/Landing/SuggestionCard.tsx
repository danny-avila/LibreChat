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
        'flex items-center gap-3 rounded-2xl border border-border-medium px-4 py-3 text-start align-top',
        'shadow-[0_0_2px_0_rgba(0,0,0,0.05),0_4px_6px_0_rgba(0,0,0,0.02)]',
        'transition-colors duration-300 ease-in-out fade-in',
        'hover:bg-surface-tertiary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
      )}
    >
      <Icon className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />
      <span className="text-sm text-text-primary">{title}</span>
    </button>
  );
}

export default memo(SuggestionCard);
