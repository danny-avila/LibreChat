import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@librechat/client';

type UserActionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
};

/**
 * Shared dialog shell for admin user action modals. Built on Radix
 * AlertDialog for proper focus trap, Escape handling, and accessibility.
 */
export default function UserActionDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: UserActionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <div className="flex flex-col gap-3">{children}</div>
        <AlertDialogFooter className="gap-2">{footer}</AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
