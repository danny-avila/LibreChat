import type { TFile } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import FilePreview from './FilePreview';
import RemoveFile from './RemoveFile';
import { getFileType } from '~/utils';

const FileContainer = ({
  file,
  onDelete,
}: {
  file: ExtendedFile | TFile;
  onDelete?: () => void;
}) => {
  const fileType = getFileType(file.type);

  return (
    <div className="group relative inline-block text-sm text-black/70 dark:text-white/90">
      <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-600">
        <div className="w-60 p-2 dark:bg-gray-600">
          <div className="flex flex-row items-center gap-2">
            <FilePreview file={file} fileType={fileType} className="relative" />
            <div className="overflow-hidden">
              <div className="truncate font-medium">{file.filename}</div>
              <div className="truncate text-gray-300">{fileType.title}</div>
            </div>
          </div>
        </div>
      </div>
      {onDelete && <RemoveFile onRemove={onDelete} />}
    </div>
  );
};

export default FileContainer;
