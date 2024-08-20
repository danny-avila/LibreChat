import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { useDoubleClick } from '@zattoo/use-double-click';
import type { clickEvent } from '@zattoo/use-double-click';
import { cn } from '~/utils';

interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  className?: string;
  doubleClickHandler?: (event: clickEvent) => void;
  disabled?: boolean;
  value?: number[];
  onValueChange?: (value: number[]) => void;
  max?: number;
  min?: number;
  step?: number;
  id?: string;
}

const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, SliderProps>(
  (
    { className, disabled, doubleClickHandler, value, onValueChange, max, min, step, id, ...props },
    ref,
  ) => (
    <SliderPrimitive.Root
      ref={ref}
      className={cn('relative flex w-full touch-none select-none items-center', className ?? '')}
      disabled={disabled}
      value={value}
      onValueChange={onValueChange}
      max={max}
      min={min}
      step={step}
      id={id}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-gray-200 dark:bg-gray-850">
        <SliderPrimitive.Range className="absolute h-full bg-gray-850  dark:bg-white" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        onClick={
          useDoubleClick(doubleClickHandler as clickEvent) ??
          (() => {
            return;
          })
        }
        aria-label={props['aria-label']}
        className="block h-4 w-4 cursor-pointer rounded-full border border-border-medium-alt bg-white shadow ring-ring-primary transition-colors focus-visible:ring-1 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 dark:border-none"
      />
    </SliderPrimitive.Root>
  ),
);

Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
