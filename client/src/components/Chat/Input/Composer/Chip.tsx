import { memo } from 'react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '~/utils';

/**
 * Every kind of staged context the composer can hold. The chip surface is
 * identical across kinds — only the leading icon carries the accent — so the
 * tray reads as one list rather than four stacked systems.
 */
export type ChipTone = 'file' | 'quote' | 'skill' | 'tool';

const TONE_ICON: Record<ChipTone, string> = {
  file: 'text-text-secondary',
  quote: 'text-cyan-500',
  skill: 'text-purple-500',
  /** Tools carry their own accent; this is only the fallback (MCP servers,
   *  whose icons are their own branding and shouldn't be tinted). */
  tool: 'text-text-primary',
};

const BASE_CLASS =
  'group/chip inline-flex min-w-0 items-center gap-1.5 rounded-xl border bg-surface-secondary text-sm text-text-secondary transition-colors';

export interface ChipProps {
  label: string;
  tone: ChipTone;
  /** Full text for the native tooltip when `label` is truncated. */
  title?: string;
  icon?: ReactNode;
  /** Overrides the tone's default icon tint, so each tool keeps the colour it
   *  had as a badge rather than every chip reading as one accent. */
  iconClassName?: string;
  /** Square preview rendered in place of `icon`, used by image attachments. */
  thumbnail?: ReactNode;
  /** Rendered between the label and the remove button. */
  trailing?: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
  'data-testid'?: string;
}

function Chip({
  label,
  tone,
  title,
  icon,
  iconClassName,
  thumbnail,
  trailing,
  onRemove,
  removeLabel,
  className,
  'data-testid': testId,
}: ChipProps) {
  return (
    <span
      role="listitem"
      data-testid={testId}
      data-tone={tone}
      className={cn(BASE_CLASS, 'max-w-full border-border-light px-2.5 py-1', className)}
    >
      {thumbnail ?? (
        <span
          className={cn('flex shrink-0 items-center', iconClassName ?? TONE_ICON[tone])}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <span className="max-w-[14rem] truncate" title={title ?? label}>
        {label}
      </span>
      {trailing}
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="-mr-1 shrink-0 rounded-full p-0.5 text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

export default memo(Chip);
