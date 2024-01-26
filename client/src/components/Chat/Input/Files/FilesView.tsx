import { FileSources } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui';
import { useGetFiles } from '~/data-provider';
import { DataTable, columns } from './Table';
import { cn } from '~/utils/';

export default function Files({ open, onOpenChange }) {
  const { data: files = [] } = useGetFiles<TFile[]>({
    select: (files) =>
      files.map((file) => {
        if (file.source === FileSources.local || file.source === FileSources.openai) {
          return file;
        } else {
          return {
            ...file,
            source: FileSources.local,
          };
        }
      }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('shadow-2xl dark:bg-gray-900 dark:text-white')}>
        <DialogHeader>
          <DialogTitle className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-200">
            My Files
          </DialogTitle>
        </DialogHeader>
        <div className="p-0 sm:p-6 sm:pt-4">
          <DataTable columns={columns} data={files} />
          <div className="mt-5 sm:mt-4" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
