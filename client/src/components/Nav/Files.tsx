import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui';
import { DataTable, columns, files } from './FileTable';
import { cn } from '~/utils/';

export default function Files({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('shadow-2xl dark:bg-gray-900 dark:text-white')}>
        <DialogHeader>
          <DialogTitle className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-200">
            My Files
          </DialogTitle>
        </DialogHeader>
        <div className="p-4 sm:p-6 sm:pt-4">
          <DataTable columns={columns} data={files} />
          <div className="mt-5 sm:mt-4" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
