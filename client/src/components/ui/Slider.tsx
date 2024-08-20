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
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
        <SliderPrimitive.Range className="absolute h-full bg-gray-400 dark:bg-gray-400" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        onClick={
          useDoubleClick(doubleClickHandler as clickEvent) ??
          (() => {
            return;
          })
        }
        aria-label={props['aria-label']}
        className="block h-4 w-4 cursor-pointer rounded-full border-2 border-gray-400 bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-200 dark:bg-gray-400 dark:focus:ring-gray-400 dark:focus:ring-offset-gray-800"
        disabled={disabled}
      />
    </SliderPrimitive.Root>
  ),
);

Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
