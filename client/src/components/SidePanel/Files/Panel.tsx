import { DataTable, columns, files } from '~/components/Chat/Input/Files/Table';
// import { cn } from '~/utils/';

export default function FilesPanel() {
  return (
    <div className="p-1">
      <DataTable columns={columns} data={files} />
    </div>
  );
}
