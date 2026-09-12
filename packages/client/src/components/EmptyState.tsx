import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '~/utils';

export interface EmptyStateProps {
  /** Decorative, rendered inside the circular surface at a fixed size. */
  icon: LucideIcon;
  /** Omitted for the "nothing matched your filter" shape, which is a line on its own. */
  title?: string;
  description?: string;
  /** A single call to action, e.g. a retry button. */
  action?: ReactNode;
  className?: string;
}

/**
 * The panel empty state: a bordered card with a circular icon, a title and a line of
 * explanation. Owned here because bookmarks, memories and schedules each render the
 * same card, and three copies of one appearance means a theme or spacing change has
 * to be made three times and will eventually be made twice.
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-border-light bg-transparent p-6 text-center',
        className,
      )}
    >
      <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-surface-tertiary">
        <Icon className="size-5 text-text-secondary" aria-hidden={true} />
      </div>
      {title != null && <p className="text-sm font-medium text-text-primary">{title}</p>}
      {description != null && (
        // Without a title the description IS the message, so it carries the title's
        // size rather than reading as a caption under nothing.
        <p className={cn(title == null ? 'text-sm' : 'mt-0.5 text-xs', 'text-text-secondary')}>
          {description}
        </p>
      )}
      {action != null && <div className="mt-3">{action}</div>}
    </div>
  );
}
