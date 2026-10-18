import type * as t from '~/admin/types';

export function EmptyState({ message, className }: t.EmptyStateProps) {
  return (
    <div className={className ?? 'px-4 py-8 text-center text-sm text-(--cui-color-text-muted)'}>
      {message}
    </div>
  );
}
