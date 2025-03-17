import type { TFile } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import FileIcon from '~/components/svg/Files/FileIcon';
import ProgressCircle from './ProgressCircle';
import SourceIcon from './SourceIcon';
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
  const radius = 55;
  const circumference = 2 * Math.PI * radius;
  const progress = useProgress(
    file?.['progress'] ?? 1,
    0.001,
    (file as ExtendedFile | undefined)?.size ?? 1,
  );

  const offset = circumference - progress * circumference;
  const circleCSSProperties = {
    transition: 'stroke-dashoffset 0.5s linear',
  };

  return (
    <div className={cn('relative size-10 shrink-0 overflow-hidden rounded-xl', className)}>
      <FileIcon file={file} fileType={fileType} />
      <SourceIcon source={file?.source} isCodeFile={!!file?.['metadata']?.fileIdentifier} />
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
