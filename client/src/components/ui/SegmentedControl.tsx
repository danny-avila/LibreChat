import { forwardRef, useEffect, useRef, useState } from 'react';
import { cn } from '~/utils';

export interface SegmentedControlOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  className?: string;
  disabled?: boolean;
}

export const SegmentedControl = forwardRef<HTMLDivElement, SegmentedControlProps>(
  ({ options, value, onValueChange, name, className, disabled }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [indicatorStyle, setIndicatorStyle] = useState({ width: 0, height: 0, left: 0, top: 0 });
    const [isInitialized, setIsInitialized] = useState(false);
    const [useGrid, setUseGrid] = useState(false);

    // Ensure we always have a current value
    const currentValue = value !== undefined ? value : options[0]?.value;

    const handleChange = (newValue: string) => {
      if (disabled) return;
      onValueChange?.(newValue);
    };

    const updateIndicator = () => {
      if (!containerRef.current) return;

      const selector = currentValue === '' ? '[data-value=""]' : `[data-value="${currentValue}"]`;
      const activeButton = containerRef.current.querySelector(selector) as HTMLButtonElement;

      if (activeButton) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const buttonRect = activeButton.getBoundingClientRect();

        if (useGrid) {
          // 2x2 grid layout - use full button dimensions
          setIndicatorStyle({
            width: buttonRect.width,
            height: buttonRect.height,
            left: buttonRect.left - containerRect.left,
            top: buttonRect.top - containerRect.top,
          });
        } else {
          // 1-row layout - account for flex-1 distribution
          const containerPadding = 4; // p-1 = 4px
          setIndicatorStyle({
            width: buttonRect.width,
            height: buttonRect.height,
            left: buttonRect.left - containerRect.left - containerPadding,
            top: buttonRect.top - containerRect.top - containerPadding,
          });
        }

        if (!isInitialized) {
          setIsInitialized(true);
        }
      }
    };

    // Check if text is being truncated and switch to grid if needed
    const checkLayout = () => {
      if (!containerRef.current) return;

      const buttons = containerRef.current.querySelectorAll('button');
      let needsGrid = false;

      buttons.forEach((button) => {
        if (button.scrollWidth > button.clientWidth) {
          needsGrid = true;
        }
      });

      if (needsGrid !== useGrid) {
        setUseGrid(needsGrid);
      }
    };

    // Initialize and handle resize
    useEffect(() => {
      const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          checkLayout();
          updateIndicator();
        });
      });

      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
        // Initial check
        setTimeout(() => {
          checkLayout();
          updateIndicator();
        }, 0);
      }

      return () => resizeObserver.disconnect();
    }, []);

    // Update indicator when value changes
    useEffect(() => {
      updateIndicator();
    }, [currentValue, options]);

    return (
      <div
        ref={containerRef}
        className={cn(
          'relative rounded-lg bg-surface-secondary p-1',
          useGrid ? 'grid grid-cols-2 gap-1' : 'flex items-center',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
        role="radiogroup"
      >
        {/* Sliding background indicator */}
        <div
          className={cn(
            'ring-border-light/20 absolute rounded-md bg-surface-primary shadow-sm ring-1 transition-all duration-300 ease-out',
            !isInitialized && 'opacity-0',
          )}
          style={{
            width: indicatorStyle.width,
            height: indicatorStyle.height,
            transform: `translate(${indicatorStyle.left}px, ${indicatorStyle.top}px)`,
          }}
        />

        {options.map((option) => {
          const isActive = currentValue === option.value;
          const isDisabled = disabled || option.disabled;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={isDisabled}
              data-value={option.value}
              onClick={() => handleChange(option.value)}
              className={cn(
                'relative z-10 px-2 py-1.5 text-xs font-medium transition-colors duration-200 ease-out',
                'rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'min-w-0 truncate',
                useGrid ? 'w-full' : 'flex-1',
                isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
                !isDisabled && 'cursor-pointer',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  },
);

SegmentedControl.displayName = 'SegmentedControl';
