import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { ClassProp } from 'class-variance-authority/types';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '~/utils';

const buttonVariants: (
  props?:
    | ({
        variant?:
          | 'default'
          | 'link'
          | 'submit'
          | 'outline'
          | 'subtle'
          | 'destructive'
          | 'secondary'
          | 'ghost'
          | null
          | undefined;
        size?: 'default' | 'icon' | 'sm' | 'lg' | null | undefined;
      } & ClassProp)
    | undefined,
) => string = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-surface-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-surface-inverted text-text-inverted hover:bg-surface-inverted-hover',
        destructive: 'bg-surface-destructive text-white hover:bg-surface-destructive-hover',
        outline:
          'text-text-primary border border-border-light bg-transparent hover:bg-surface-hover hover:text-text-primary',
        subtle:
          'rounded-xl border border-border-light bg-transparent text-text-primary hover:bg-surface-secondary focus-visible:ring-text-primary focus-visible:ring-offset-0',
        secondary: 'bg-surface-secondary text-text-primary hover:bg-surface-hover',
        ghost: 'hover:bg-surface-hover hover:text-text-primary',
        link: 'text-text-primary underline-offset-4 hover:underline',
        // hardcoded text color because of WCAG contrast issues (text-white)
        submit: 'bg-surface-submit text-white hover:bg-surface-submit-hover',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3',
        lg: 'h-11 rounded-lg px-8',
        icon: 'size-10',
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
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button: React.ForwardRefExoticComponent<
  ButtonProps & React.RefAttributes<HTMLButtonElement>
> = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type = 'button', ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        type={asChild ? undefined : type}
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
