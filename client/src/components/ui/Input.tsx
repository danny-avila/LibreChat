import * as React from 'react';

import { cn } from '~/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-md border border-border-light bg-transparent px-3 py-2 text-sm placeholder:text-text-tertiary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-50',
        className ?? '',
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
