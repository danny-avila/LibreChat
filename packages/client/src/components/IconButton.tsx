import * as React from 'react';
import { cva } from 'class-variance-authority';
import type { ClassProp } from 'class-variance-authority/types';
import { cn } from '~/utils';

type IconButtonVariantProps = {
  variant?: 'default' | 'secondary' | 'ghost' | 'destructive' | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | null;
  shape?: 'round' | 'square' | null;
};

const iconButtonVariants: (props?: IconButtonVariantProps & ClassProp) => string = cva(
  'inline-flex shrink-0 items-center justify-center rounded-full text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-surface-secondary hover:bg-surface-hover',
        secondary: 'border border-border-light bg-surface-secondary hover:bg-surface-hover',
        ghost: 'bg-transparent hover:bg-surface-hover',
        destructive:
          'bg-surface-destructive text-text-on-status hover:bg-surface-destructive-hover',
      },
      size: {
        xs: 'size-6',
        sm: 'size-8',
        md: 'size-9',
        lg: 'size-10',
      },
      shape: {
        round: 'rounded-full',
        square: 'rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'md',
      shape: 'round',
    },
  },
);

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>,
    IconButtonVariantProps {
  label: string;
}

const IconButton: React.ForwardRefExoticComponent<
  IconButtonProps & React.RefAttributes<HTMLButtonElement>
> = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, label, type = 'button', variant, size, shape, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cn(iconButtonVariants({ variant, size, shape, className }))}
      {...props}
    />
  ),
);

IconButton.displayName = 'IconButton';

export { IconButton, iconButtonVariants };
