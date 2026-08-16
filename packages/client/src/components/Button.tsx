import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { ClassProp } from 'class-variance-authority/types';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '~/utils';

type ButtonVariantOptions =
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
        | 'row-action'
        | 'section-action'
        | null
        | undefined;
      size?: 'default' | 'icon' | 'icon-sm' | 'icon-xs' | 'sm' | 'lg' | 'theme' | null | undefined;
      shape?: 'default' | 'theme' | null | undefined;
    } & ClassProp)
  | undefined;

const buttonVariantRecipe = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-surface-primary transition-colors duration-theme-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-surface-inverted text-text-inverted hover:bg-surface-inverted-hover',
        destructive:
          'bg-surface-destructive text-text-on-status hover:bg-surface-destructive-hover',
        outline:
          'text-text-primary border border-border-light bg-transparent hover:bg-surface-hover hover:text-text-primary',
        subtle:
          'border border-border-light bg-transparent text-text-primary hover:bg-surface-secondary focus-visible:ring-text-primary focus-visible:ring-offset-0',
        secondary: 'bg-surface-secondary text-text-primary hover:bg-surface-hover',
        ghost: 'hover:bg-surface-hover hover:text-text-primary',
        'row-action': 'hover:bg-surface-hover-alt hover:text-text-primary',
        link: 'text-text-primary underline-offset-4 hover:underline',
        submit: 'bg-surface-submit text-text-on-status hover:bg-surface-submit-hover',
        /**
         * A quiet icon action sitting beside a section heading in the sidebar.
         * Unlike `row-action`, it recedes until hovered so the heading stays
         * the thing being read, and its ring sits inside the control because
         * these sit close enough that an offset one would cross a neighbour.
         */
        'section-action':
          'rounded-md text-text-secondary hover:bg-surface-active-alt hover:text-text-primary focus-visible:ring-inset focus-visible:ring-offset-0',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3',
        lg: 'h-11 rounded-lg px-8',
        icon: 'size-10',
        'icon-sm': 'size-8 p-0',
        'icon-xs': 'size-7',
        theme: 'h-theme-control gap-theme-compact px-theme-normal',
      },
      shape: {
        default: 'rounded-lg',
        theme: 'rounded-theme-control',
        unset: '',
      },
    },
    compoundVariants: [
      {
        variant: 'subtle',
        shape: 'unset',
        class: 'rounded-xl',
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
      shape: 'unset',
    },
  },
);

const buttonVariants: (props?: ButtonVariantOptions) => string = (props) =>
  buttonVariantRecipe(
    props == null ? props : { ...props, shape: props.shape == null ? 'unset' : props.shape },
  );

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button: React.ForwardRefExoticComponent<
  ButtonProps & React.RefAttributes<HTMLButtonElement>
> = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, shape, asChild = false, type = 'button', ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        type={asChild ? undefined : type}
        className={cn(buttonVariants({ variant, size, shape, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
