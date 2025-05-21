import { X, ArrowDownToLine } from 'lucide-react';
import { Button, OGDialog, OGDialogContent } from '~/components';

export default function DialogImage({ isOpen, onOpenChange, src = '', downloadImage }) {
  return (
    <OGDialog open={isOpen} onOpenChange={onOpenChange}>
      <OGDialogContent
        showCloseButton={false}
        className="h-full w-full rounded-none bg-transparent"
        disableScroll={false}
        overlayClassName="bg-surface-primary opacity-95 z-50"
      >
        <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-4">
          <Button
            onClick={() => onOpenChange(false)}
            variant="ghost"
            className="h-10 w-10 p-0 hover:bg-surface-hover"
          >
            <X className="size-6" />
          </Button>
          <Button onClick={() => downloadImage()} variant="ghost" className="h-10 w-10 p-0">
            <ArrowDownToLine className="size-6" />
          </Button>
        </div>
        <OGDialog open={isOpen} onOpenChange={onOpenChange}>
          <OGDialogContent
            showCloseButton={false}
            className="w-11/12 overflow-x-auto rounded-none bg-transparent p-4 shadow-none sm:w-auto"
            disableScroll={false}
            overlayClassName="bg-transparent"
          >
            <img
              src={src}
              alt="Uploaded image"
              className="max-w-screen h-full max-h-screen w-full object-contain"
            />
          </OGDialogContent>
        </OGDialog>
      </OGDialogContent>
    </OGDialog>
  );
}
