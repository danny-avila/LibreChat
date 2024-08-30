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
    <div className="group relative inline-block text-sm text-text-primary">
      <div className="relative overflow-hidden rounded-xl border border-border-medium">
        <div className="w-60 bg-surface-active p-2">
          <div className="flex flex-row items-center gap-2">
            <FilePreview file={file} fileType={fileType} className="relative" />
            <div className="overflow-hidden">
              <div className="truncate font-medium">{file.filename}</div>
              <div className="truncate text-text-secondary">{fileType.title}</div>
            </div>
          </div>
        </div>
      </div>
      {onDelete && <RemoveFile onRemove={onDelete} />}
    </div>
  );
};

export default FileContainer;
