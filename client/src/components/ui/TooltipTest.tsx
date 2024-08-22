import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '~/utils';

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>((props, ref) => <TooltipPrimitive.Trigger ref={ref} {...props} />);
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;

const TooltipPortal = TooltipPrimitive.Portal;

const TooltipArrow = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Arrow>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Arrow>
>((props, ref) => <TooltipPrimitive.Arrow ref={ref} {...props} />);
TooltipArrow.displayName = TooltipPrimitive.Arrow.displayName;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className = '', forceMount, children, ...props }, ref) => (
  <TooltipPortal forceMount={forceMount}>
    <TooltipPrimitive.Content
      className={cn(
        'shadow-xs relative z-[1000] max-w-xs rounded-lg border border-gray-900/10 bg-gray-900 p-1 transition-opacity',
        className,
      )}
      ref={ref}
      {...props}
      style={{ userSelect: 'none' }}
    >
      <span className="flex items-center whitespace-pre-wrap px-2 py-1 text-center text-sm font-medium normal-case text-white">
        {children}
        <TooltipArrow className="TooltipArrow" />
      </span>
    </TooltipPrimitive.Content>
  </TooltipPortal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

const TooltipProvider = TooltipPrimitive.Provider;

export { Tooltip, TooltipTrigger, TooltipPortal, TooltipContent, TooltipArrow, TooltipProvider };
