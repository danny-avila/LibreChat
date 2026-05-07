import { ReactNode } from 'react';
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogDescription,
  OGDialogFooter,
} from '@librechat/client';

type AdminActionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
};

/**
 * Shared dialog shell for admin subscription action modals. Built on top of
 * the shared `OGDialog` primitive (Radix), so it gets focus-trap, Escape
 * handling and accessible labelling for free.
 */
export default function AdminActionDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: AdminActionDialogProps) {
  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="max-w-md">
        <OGDialogHeader>
          <OGDialogTitle>{title}</OGDialogTitle>
          {description ? <OGDialogDescription>{description}</OGDialogDescription> : null}
        </OGDialogHeader>
        <div className="flex flex-col gap-3">{children}</div>
        <OGDialogFooter className="gap-2">{footer}</OGDialogFooter>
      </OGDialogContent>
    </OGDialog>
  );
}
