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
      <div className="relative overflow-hidden rounded-2xl border border-border-light">
        <div className="w-56 bg-surface-hover-alt p-1.5">
          <div className="flex flex-row items-center gap-2">
            <FilePreview file={file} fileType={fileType} className="relative" />
            <div className="overflow-hidden">
              <div className="truncate font-medium" title={file.filename}>
                {file.filename}
              </div>
              <div className="truncate text-text-secondary" title={fileType.title}>
                {fileType.title}
              </div>
            </div>
          </div>
        </div>
      </div>
      {onDelete && <RemoveFile onRemove={onDelete} />}
    </div>
  );
};

export default FileContainer;
