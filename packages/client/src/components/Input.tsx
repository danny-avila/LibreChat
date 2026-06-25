import * as React from 'react';
import { cn } from '~/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input: React.ForwardRefExoticComponent<InputProps & React.RefAttributes<HTMLInputElement>> =
  React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
    return (
      <input
        className={cn(
          'flex h-10 w-full rounded-lg border border-border-light bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground transition-colors hover:border-border-medium focus-visible:border-border-heavy focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          className ?? '',
        )}
        ref={ref}
        {...props}
      />
    );
  });

Input.displayName = 'Input';

export { Input };
