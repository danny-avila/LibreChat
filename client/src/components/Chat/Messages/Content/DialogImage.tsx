import { X } from 'lucide-react';
import { OGDialog, OGDialogClose, OGDialogContent } from '~/components';

export default function DialogImage({ isOpen, onOpenChange, src = '' }) {
  return (
    <OGDialog open={isOpen} onOpenChange={onOpenChange}>
      <OGDialogClose asChild>
        <button
          className="absolute left-4 top-4 text-gray-50 transition hover:text-gray-200"
          type="button"
        >
          <X className="size-6" />
        </button>
      </OGDialogClose>
      <OGDialogContent
        showCloseButton={false}
        className="w-11/12 overflow-x-auto rounded-none bg-transparent p-0 sm:w-auto"
        disableScroll={false}
      >
        <img
          src={src}
          alt="Uploaded image"
          className="max-w-screen h-full max-h-screen w-full object-contain"
        />
      </OGDialogContent>
    </OGDialog>
  );
}
