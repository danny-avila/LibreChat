import { FileSources, FileContext } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui';
import { useGetFiles } from '~/data-provider';
import { DataTable, columns } from './Table';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils/';

export default function Files({ open, onOpenChange }) {
  const localize = useLocalize();

  const { data: files = [] } = useGetFiles<TFile[]>({
    select: (files) =>
      files.map((file) => {
        file.context = file.context ?? FileContext.unknown;
        file.filterSource = file.source === FileSources.firebase ? FileSources.local : file.source;
        return file;
      }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('w-11/12 overflow-x-auto shadow-2xl dark:bg-gray-700 dark:text-white')}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-200">
            {localize('com_nav_my_files')}
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-x-auto p-0 sm:p-6 sm:pt-4">
          <DataTable columns={columns} data={files} />
          <div className="mt-5 sm:mt-4" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
