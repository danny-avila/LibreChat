import FilesPanel from '~/components/SidePanel/Files/Panel';

export default function FilesView() {
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-presentation">
      <FilesPanel />
    </div>
  );
}
