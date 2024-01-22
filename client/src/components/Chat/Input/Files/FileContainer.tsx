import type { ExtendedFile } from '~/common';
import FileIcon from '~/components/svg/Files/FileIcon';
import ProgressCircle from './ProgressCircle';
import RemoveFile from './RemoveFile';
import { getFileType } from '~/utils';

const FileContainer = ({ file, onDelete }: { file: ExtendedFile; onDelete: () => void }) => {
  const radius = 55; // Radius of the SVG circle
  const circumference = 2 * Math.PI * radius;
  const progress = file.progress ?? 1;

  // Calculate the offset based on the loading progress
  const offset = circumference - progress * circumference;
  const circleCSSProperties = {
    transition: 'stroke-dashoffset 0.3s linear',
  };

  const fileType = getFileType(file.type);

  return (
    <div className="group relative inline-block text-sm text-black/70 dark:text-white/90">
      <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-600">
        <div className="w-60 p-2 dark:bg-gray-600">
          <div className="flex flex-row items-center gap-2">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md">
              <FileIcon file={file} fileType={fileType} />
              {progress < 1 && (
                <ProgressCircle
                  circumference={circumference}
                  offset={offset}
                  circleCSSProperties={circleCSSProperties}
                />
              )}
            </div>
            <div className="overflow-hidden">
              <div className="truncate font-medium">{file.filename}</div>
              <div className="truncate text-gray-300">{fileType.title}</div>
            </div>
          </div>
        </div>
      </div>
      <RemoveFile onRemove={onDelete} />
    </div>
  );
};

export default FileContainer;
