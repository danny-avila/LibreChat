import React from 'react';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from './OriginalDialog';
import { cn } from '~/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className }) => {
  return (
    <OGDialog open={isOpen} onOpenChange={onClose}>
      <OGDialogContent className={cn(
        'sm:max-w-[800px] bg-white p-8 rounded-2xl shadow-lg',
        'border border-gray-200',
        className,
      )}>
        <OGDialogHeader className="mb-2">
          <OGDialogTitle className="text-3xl font-bold text-center">{title}</OGDialogTitle>
        </OGDialogHeader>
        <div className="overflow-y-auto max-h-[80vh]">
          {children}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
};

export default Modal;