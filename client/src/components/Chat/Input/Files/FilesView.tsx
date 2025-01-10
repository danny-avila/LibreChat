import { FileSources, FileContext } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '~/components';
import { useGetFiles } from '~/data-provider';
import { DataTable, columns } from './Table';
import { useLocalize } from '~/hooks';

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
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent
        title={localize('com_nav_my_files')}
        className="w-11/12 bg-background text-text-primary shadow-2xl"
      >
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_nav_my_files')}</OGDialogTitle>
        </OGDialogHeader>
        <DataTable columns={columns} data={files} />
      </OGDialogContent>
    </OGDialog>
  );
}
