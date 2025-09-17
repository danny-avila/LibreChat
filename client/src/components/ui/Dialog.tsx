import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '../ui/Button';
import { X } from 'lucide-react';
import { cn } from '~/utils';
import { useMediaQuery } from '~/hooks';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;

type DialogPortalProps = DialogPrimitive.DialogPortalProps & { className?: string };

const DialogPortal = ({ className = '', children, ...props }: DialogPortalProps) => (
  <DialogPrimitive.Portal className={cn(className)} {...(props as DialogPortalProps)}>
    <div className="fixed inset-0 z-[999] flex items-center justify-center">{children}</div>
  </DialogPrimitive.Portal>
);
DialogPortal.displayName = DialogPrimitive.Portal.displayName;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-[999] bg-gray-600/65 transition-all duration-100 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in dark:bg-black/80',
      className ?? '',
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  disableScroll?: boolean;
  maxWidth?: string; // Custom max width prop
  maxHeight?: string; // Custom max height prop
};

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    { className, children = true, showCloseButton = true, disableScroll = false, maxWidth = 'max-w-2xl', maxHeight = 'auto', ...props },
    ref,
  ) => {
    const isSmallScreen = useMediaQuery('(max-width: 768px)');
    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            // Use custom maxWidth and maxHeight, fallback to defaults if not provided
            'fixed z-[999] grid w-full gap-4 rounded-lg border border-gray-200 bg-white p-6 shadow-lg animate-in data-[state=open]:fade-in-90 data-[state=open]:slide-in-from-bottom-10',
            `max-w-[${maxWidth}]`, // Dynamic max-width
            maxHeight !== 'auto' ? `max-h-[${maxHeight}]` : '', // Dynamic max-height
            'dark:border-gray-700 dark:bg-gray-800',
            isSmallScreen
              ? 'fixed left-1/2 top-1/2 z-[999] m-auto grid w-11/12 -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-white p-6 dark:bg-gray-800'
              : 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2', // Center on desktop
            disableScroll ? 'overflow-hidden' : 'overflow-y-auto', // Ensure scroll if not disabled
            className ?? '',
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-1.5 opacity-70 transition-opacity hover:bg-gray-100 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:pointer-events-none dark:hover:bg-gray-700 dark:focus:ring-white dark:focus:ring-offset-gray-800">
              <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 border-b border-gray-200 p-6 pb-4 text-left dark:border-gray-700',
      className ?? '',
    )}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-row justify-end gap-3 border-t border-gray-200 px-6 pt-4 dark:border-gray-700',
      className ?? '',
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-xl font-semibold text-gray-900 dark:text-gray-50', className ?? '')}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm leading-relaxed text-gray-600 dark:text-gray-300', className ?? '')}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

const DialogClose = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Close
    ref={ref}
    className={cn(
      'mt-2 inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-transparent px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 sm:mt-0',
      className ?? '',
      'focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:focus:ring-gray-400 dark:focus:ring-offset-gray-900',
    )}
    {...props}
  />
));
DialogClose.displayName = DialogPrimitive.Close.displayName;

const DialogButton = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentPropsWithoutRef<typeof Button>
>(({ className, ...props }, ref) => (
  <Button
    ref={ref}
    variant="outline"
    className={cn(
      'mt-2 inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-transparent px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:focus:ring-gray-400 dark:focus:ring-offset-gray-900 sm:mt-0',
      className ?? '',
    )}
    {...props}
  />
));
DialogButton.displayName = 'DialogButton';

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogButton,
};