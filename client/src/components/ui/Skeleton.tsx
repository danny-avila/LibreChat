import { cn } from '~/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-gray-100 bg-opacity-50 dark:bg-gray-750 dark:bg-opacity-25',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
