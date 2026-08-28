import { Button, TooltipAnchor } from '@librechat/client';
import type { LucideIcon } from 'lucide-react';
import { cn } from '~/utils';

interface OptionToggleProps {
  icon: LucideIcon;
  pressed: boolean;
  label: string;
  /** Defaults to `label` (bulk toggles use the same text for both). */
  tooltip?: string;
  /** Text color applied directly to the icon when pressed. */
  activeClass: string;
  onToggle: () => void;
  size?: 'sm' | 'md';
  /**
   * Renders the toggle inert (dimmed, non-interactive) while keeping it
   * visible with its tooltip, so the user can learn WHY the option is
   * unavailable instead of it silently disappearing.
   */
  disabled?: boolean;
}

/**
 * Icon toggle for a per-tool option (defer / programmatic / background /
 * intent), shared between the per-tool row (`sm`) and the section-header bulk
 * action (`md`).
 */
export default function OptionToggle({
  icon: Icon,
  pressed,
  label,
  tooltip,
  activeClass,
  onToggle,
  size = 'sm',
  disabled = false,
}: OptionToggleProps) {
  return (
    <TooltipAnchor
      description={tooltip ?? label}
      side="top"
      render={
        <Button
          variant="ghost"
          size="icon"
          onClick={disabled ? undefined : onToggle}
          aria-pressed={pressed}
          aria-label={label}
          aria-disabled={disabled || undefined}
          className={cn(
            'rounded-md',
            size === 'sm' ? 'size-6' : 'size-7',
            disabled
              ? 'cursor-not-allowed text-text-tertiary opacity-60 hover:bg-transparent hover:text-text-tertiary'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-secondary',
          )}
        >
          <Icon className={cn('size-4', pressed && activeClass)} aria-hidden="true" />
        </Button>
      }
    />
  );
}
