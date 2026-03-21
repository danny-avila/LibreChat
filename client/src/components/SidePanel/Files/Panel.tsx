import type { TFile } from 'librechat-data-provider';
import { useGetFiles } from '~/data-provider';
import { columns } from './PanelColumns';
import DataTable from './PanelTable';

export default function FilesPanel() {
  const { data: files = [] } = useGetFiles<TFile[]>();

  return (
    <div className="h-auto max-w-full overflow-x-visible">
      <DataTable columns={columns} data={files} />
    </div>
  );
}
