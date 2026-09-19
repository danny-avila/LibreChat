import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '~/utils';

export function Panel({ className, ...props }: ComponentPropsWithoutRef<'section'>) {
  return (
    <section
      {...props}
      className={cn(
        'min-w-0 rounded-lg border border-border-light bg-surface-primary p-5',
        'dark:border-chart-widget-stroke dark:bg-chart-widget-surface',
        className,
      )}
    />
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center text-sm text-text-secondary">
      {message}
    </div>
  );
}
