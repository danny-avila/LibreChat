import * as React from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';

import { cn } from '~/utils';

const Separator: React.ForwardRefExoticComponent<
  Omit<SeparatorPrimitive.SeparatorProps & React.RefAttributes<HTMLDivElement>, 'ref'> & {
    className?: string;
  } & React.RefAttributes<HTMLDivElement>
> = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root> & {
    className?: string;
  }
>(({ className = '', orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    {...props}
    {...{
      decorative,
      orientation,
      className: cn(
        'shrink-0 bg-border-light',
        orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
        className,
      ),
    }}
  />
));
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
