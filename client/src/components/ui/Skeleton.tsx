import { cn } from '~/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-surface-tertiary opacity-50 dark:opacity-25',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
