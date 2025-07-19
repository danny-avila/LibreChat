import * as React from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';

import { cn } from '~/utils';

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root> & {
    className?: string;
  }
>(({ className = '', orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    {...(props as any)}
    {...({
      decorative,
      orientation,
      className: cn(
        'shrink-0 bg-border-light',
        orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
        className,
      ),
    } as any)}
  />
));
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
