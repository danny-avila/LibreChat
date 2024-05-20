import type { TFile } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import FileIcon from '~/components/svg/Files/FileIcon';
import ProgressCircle from './ProgressCircle';
import { useProgress } from '~/hooks';
import { cn } from '~/utils';

const FilePreview = ({
  file,
  fileType,
  className = '',
}: {
  file?: ExtendedFile | TFile;
  fileType: {
    paths: React.FC;
    fill: string;
    title: string;
  };
  className?: string;
}) => {
  const radius = 55; // Radius of the SVG circle
  const circumference = 2 * Math.PI * radius;
  const progress = useProgress(file?.['progress'] ?? 1, 0.001, file?.size ?? 1);
  console.log(progress);

  // Calculate the offset based on the loading progress
  const offset = circumference - progress * circumference;
  const circleCSSProperties = {
    transition: 'stroke-dashoffset 0.5s linear',
  };

  return (
    <div className={cn('h-10 w-10 shrink-0 overflow-hidden rounded-md', className)}>
      <FileIcon file={file} fileType={fileType} />
      {progress < 1 && (
        <ProgressCircle
          circumference={circumference}
          offset={offset}
          circleCSSProperties={circleCSSProperties}
        />
      )}
    </div>
  );
};

export default FilePreview;
