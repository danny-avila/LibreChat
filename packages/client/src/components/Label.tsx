import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '~/utils';

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & {
    className?: string;
  }
>(({ className = '', ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    {...props}
    {...{
      className: cn(
        'block w-full break-all text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 dark:text-gray-200',
        className,
      ),
    }}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
