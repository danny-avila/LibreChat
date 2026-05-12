import React, { memo } from 'react';
import { X } from 'lucide-react';
import { cn } from '~/utils';

interface ActiveToolChipProps {
  icon: React.ReactNode;
  label: string;
  /** Tailwind classes for the pill background/border (e.g. badge color
   *  classes from the legacy badge components for visual continuity). */
  colorClass: string;
  onDismiss: () => void;
  ariaLabel?: string;
}

function ActiveToolChip({
  icon,
  label,
  colorClass,
  onDismiss,
  ariaLabel,
}: ActiveToolChipProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm',
        colorClass,
      )}
    >
      <span className="flex size-4 items-center justify-center">{icon}</span>
      <span>{label}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={ariaLabel ?? `Désactiver ${label}`}
        className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </div>
  );
}

export default memo(ActiveToolChip);
