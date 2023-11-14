import { FileUpload } from '~/components/ui';
import { AttachmentIcon } from '~/components/svg';

export default function AttachFile() {
  const onFilesSelected = (files: FileList) => {
    console.log(files);
  };
  return (
    <div className="absolute bottom-1 left-1">
      <FileUpload onFilesSelected={onFilesSelected} className="gizmo:flex">
        <button className="btn relative p-0 text-black dark:text-white" aria-label="Attach files">
          <div className="flex w-full items-center justify-center gap-2">
            <AttachmentIcon />
          </div>
        </button>
      </FileUpload>
    </div>
  );
}
