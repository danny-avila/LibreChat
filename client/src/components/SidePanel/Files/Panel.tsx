import type { TFile } from 'librechat-data-provider';
import { columns } from '~/components/Chat/Input/Files/Table/PanelColumns';
import DataTable from '~/components/Chat/Input/Files/Table/PanelTable';
import { useGetFiles } from '~/data-provider';

export default function FilesPanel() {
  const { data: files = [] } = useGetFiles<TFile[]>();

  return (
    <div className="h-auto max-w-full overflow-x-hidden">
      <DataTable columns={columns} data={files} />
    </div>
  );
}
