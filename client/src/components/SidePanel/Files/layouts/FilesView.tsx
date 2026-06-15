import { FileSources, FileContext } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import { DataTable, columns } from '~/components/Chat/Input/Files/Table';
import PageHeader from '~/components/ui/PageHeader';
import { useGetFiles } from '~/data-provider';
import { useLocalize } from '~/hooks';

export default function FilesView() {
  const localize = useLocalize();

  const { data: files = [] } = useGetFiles<TFile[]>({
    select: (data) =>
      data.map((file) => {
        file.context = file.context ?? FileContext.unknown;
        file.filterSource =
          file.source === FileSources.firebase ? FileSources.local : file.source;
        return file;
      }),
  });

  return (
    <main className="flex h-full min-h-0 flex-col overflow-auto bg-surface-primary text-text-primary">
      <PageHeader title={localize('com_nav_my_files')} />
      <div className="flex w-full flex-1 flex-col gap-6 px-6 pb-6">
        <DataTable columns={columns} data={files} />
      </div>
    </main>
  );
}
