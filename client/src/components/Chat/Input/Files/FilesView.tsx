import { FileSources, FileContext } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import OGDialogTemplate from '~/components/ui/DialogTemplate';
import { useGetFiles } from '~/data-provider';
import { DataTable, columns } from './Table';
import { Dialog } from '~/components/ui';
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        showCancelButton={false}
        title={localize('com_nav_my_files')}
        main={<DataTable columns={columns} data={files} />}
        className="w-11/12 overflow-x-auto bg-background text-text-primary shadow-2xl"
      />
    </Dialog>
  );
}
