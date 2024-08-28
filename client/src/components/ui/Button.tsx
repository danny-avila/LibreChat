import * as React from 'react';
import { VariantProps, cva } from 'class-variance-authority';
import { cn } from '~/utils';

const buttonVariants = cva(
  'rounded-md inline-flex items-center justify-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        default:
          'bg-gray-600 text-white hover:bg-gray-800 dark:bg-gray-200 dark:text-gray-900 dark:hover:bg-gray-300',
        destructive: 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700',
        outline:
          'bg-transparent border border-gray-200 text-gray-700 hover:bg-gray-200 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-700',
        subtle:
          'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600',
        ghost:
          'bg-transparent text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800 data-[state=open]:bg-transparent',
        link: 'bg-transparent underline-offset-4 hover:underline text-gray-600 dark:text-gray-400 hover:bg-transparent dark:hover:bg-transparent',
        success:
          'bg-green-500 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-700',
        warning:
          'bg-yellow-500 text-white hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700',
        info: 'bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700',
      },
      size: {
        default: 'h-10 py-2 px-4',
        sm: 'h-8 px-3 rounded',
        lg: 'h-12 px-6 rounded-md',
        xl: 'h-14 px-8 rounded-lg text-base',
        icon: 'h-10 w-10',
      },
      fullWidth: {
        true: 'w-full',
      },
      loading: {
        true: 'opacity-80 pointer-events-none',
      },
    },
    compoundVariants: [
      {
        variant: ['default', 'destructive', 'success', 'warning', 'info'],
        className: 'focus-visible:ring-white focus-visible:ring-offset-2',
      },
      {
        variant: 'outline',
        className: 'focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500',
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps & { customId?: string }>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      loading,
      leftIcon,
      rightIcon,
      children,
      customId,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, fullWidth, loading, className }))}
        ref={ref}
        {...props}
        id={customId ?? props.id ?? 'shadcn-button'}
        disabled={props.disabled || loading}
        aria-busy={loading}
      >
        {loading && (
          <svg
            className="-ml-1 mr-3 h-5 w-5 animate-spin text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        )}
        {leftIcon && <span className="mr-2">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="ml-2">{rightIcon}</span>}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
