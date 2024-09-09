import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { useDoubleClick } from '@zattoo/use-double-click';
import type { clickEvent } from '@zattoo/use-double-click';
import { cn } from '~/utils';

interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  doubleClickHandler?: clickEvent;
  trackClassName?: string;
}

const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, SliderProps>(
  (
    { className, trackClassName = 'bg-gray-200 dark:bg-gray-850', doubleClickHandler, ...props },
    ref,
  ) => (
    <SliderPrimitive.Root
      ref={ref}
      className={cn('relative flex w-full touch-none select-none items-center', className ?? '')}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn('relative h-1 w-full grow overflow-hidden rounded-full', trackClassName)}
      >
        <SliderPrimitive.Range className="absolute h-full bg-gray-850  dark:bg-white" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        onClick={
          useDoubleClick(doubleClickHandler as clickEvent) ??
          (() => {
            return;
          })
        }
        className="block h-4 w-4 cursor-pointer rounded-full border border-border-medium-alt bg-white shadow ring-ring-primary transition-colors focus-visible:ring-1 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 dark:border-none"
      />
    </SliderPrimitive.Root>
  ),
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
