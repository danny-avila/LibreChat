import * as React from 'react';
import { useDirection } from '@radix-ui/react-direction';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn, disabledFillClasses } from '~/utils';

type SliderProps = React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
  className?: string;
  onDoubleClick?: () => void;
  'aria-describedby'?: string;
  'aria-valuetext'?: string;
} & (
    | { 'aria-label': string; 'aria-labelledby'?: never }
    | { 'aria-labelledby': string; 'aria-label'?: never }
    | { 'aria-label': string; 'aria-labelledby': string }
  );

const Slider: React.ForwardRefExoticComponent<SliderProps & React.RefAttributes<HTMLSpanElement>> =
  React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, SliderProps>(
    (
      {
        className,
        onDoubleClick,
        'aria-labelledby': ariaLabelledBy,
        'aria-label': ariaLabel,
        'aria-describedby': ariaDescribedBy,
        'aria-valuetext': ariaValueText,
        ...props
      },
      ref,
    ) => {
      const appDirection = useDirection();
      const [direction, setDirection] = React.useState(appDirection);
      const rootRef = React.useRef<HTMLSpanElement | null>(null);
      const setRootRef = React.useCallback(
        (node: HTMLSpanElement | null) => {
          rootRef.current = node;
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        },
        [ref],
      );
      /** Radix reads only the app-wide provider. The root stamps its own `dir`, so the nearest
       *  `dir` attribute above it decides when there is one, and an LTR island inside an RTL app
       *  keeps an LTR slider; without one the provider's direction stands. Any `dir` change
       *  re-resolves it, since an island can flip while the provider does not. */
      React.useLayoutEffect(() => {
        const resolve = () => {
          const declared = rootRef.current?.parentElement?.closest('[dir]')?.getAttribute('dir');
          setDirection(declared === 'rtl' || declared === 'ltr' ? declared : appDirection);
        };
        resolve();
        const observer = new MutationObserver(resolve);
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['dir'],
          subtree: true,
        });
        return () => observer.disconnect();
      }, [appDirection]);
      return (
        <SliderPrimitive.Root
          ref={setRootRef}
          dir={direction}
          {...props}
          {...{
            className: cn(
              'relative flex w-full cursor-pointer touch-none select-none items-center',
              className,
            ),
            onDoubleClick,
          }}
        >
          <SliderPrimitive.Track
            {...{
              className:
                'relative h-2 w-full grow overflow-hidden rounded-full bg-surface-tertiary',
            }}
          >
            <SliderPrimitive.Range {...{ className: 'absolute h-full bg-surface-inverted' }} />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            {...{
              className: cn(
                'block h-5 w-5 rounded-full border-2 border-border-xheavy bg-surface-primary ring-offset-surface-primary transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-control focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
                disabledFillClasses,
              ),
              'aria-labelledby': ariaLabelledBy,
              'aria-label': ariaLabel,
              'aria-describedby': ariaDescribedBy,
              'aria-valuetext': ariaValueText,
            }}
          />
        </SliderPrimitive.Root>
      );
    },
  );
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
