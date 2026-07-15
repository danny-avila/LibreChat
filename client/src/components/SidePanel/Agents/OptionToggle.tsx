import { TooltipAnchor } from '@librechat/client';
import type { LucideIcon } from 'lucide-react';
import { cn } from '~/utils';

interface OptionToggleProps {
  icon: LucideIcon;
  pressed: boolean;
  label: string;
  /** Defaults to `label` (bulk toggles use the same text for both). */
  tooltip?: string;
  /** Text color applied when pressed (e.g. `text-amber-500`). */
  activeClass: string;
  onToggle: () => void;
  size?: 'sm' | 'md';
}

/**
 * Icon toggle for a per-tool option (defer / programmatic / background), shared
 * between the per-tool row (`sm`) and the section-header bulk action (`md`).
 */
export default function OptionToggle({
  icon: Icon,
  pressed,
  label,
  tooltip,
  activeClass,
  onToggle,
  size = 'sm',
}: OptionToggleProps) {
  return (
    <TooltipAnchor
      description={tooltip ?? label}
      side="top"
      render={
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={pressed}
          aria-label={label}
          className={cn(
            'flex items-center justify-center rounded-md transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
            size === 'sm' ? 'size-6' : 'size-7',
            pressed ? activeClass : 'text-text-secondary hover:text-text-primary',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      }
    />
  );
}
