import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/Dialog';
import GlobalFileManager from '~/components/Files/GlobalFileManager';
import { useAuthContext } from '~/hooks/AuthContext';
import { SystemRoles } from 'librechat-data-provider';

interface GlobalFilesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function GlobalFilesModal({ open, onOpenChange }: GlobalFilesModalProps) {
  const { user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;

  if (!isAdmin) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Global File Management</DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          <GlobalFileManager />
        </div>
      </DialogContent>
    </Dialog>
  );
} 