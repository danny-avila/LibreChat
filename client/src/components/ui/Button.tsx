import * as React from 'react';
import { VariantProps, cva } from 'class-variance-authority';

import { cn } from '../../utils';

const buttonVariants = cva(
  'rounded-md inline-flex items-center justify-center text-sm font-medium transition-colors dark:hover:bg-gray-700 dark:hover:text-gray-100 disabled:opacity-50 disabled:pointer-events-none data-[state=open]:bg-gray-100 dark:data-[state=open]:bg-gray-700',
  {
    variants: {
      variant: {
        default: 'bg-gray-750 text-white hover:bg-gray-800 dark:bg-gray-50 dark:text-gray-900',
        destructive: 'bg-red-500 text-white hover:bg-red-600 dark:hover:bg-red-600',
        outline:
          'bg-transparent border border-gray-200 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100',
        subtle: 'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100',
        ghost:
          'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-100 dark:hover:text-gray-100 data-[state=open]:bg-transparent dark:data-[state=open]:bg-transparent',
        link: 'bg-transparent underline-offset-4 hover:underline text-gray-900 dark:text-gray-100 hover:bg-transparent dark:hover:bg-transparent',
      },
      size: {
        default: 'h-10 py-2 px-4',
        sm: 'h-9 px-2 rounded-md',
        lg: 'h-11 px-8 rounded-md',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps & { customId?: string }>(
  ({ className, variant, size, customId, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
        id={customId ?? props?.id ?? 'shadcn-button'}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
