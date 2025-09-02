import type { TFile } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';

export default function FileIcon({
  file,
  fileType,
}: {
  file?: Partial<ExtendedFile | TFile>;
  fileType: {
    fill: string;
    paths: React.FC;
    title: string;
  };
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 36 36"
      fill="none"
      className="h-10 w-10 flex-shrink-0"
      width="36"
      height="36"
    >
      <rect width="36" height="36" rx="6" fill={fileType.fill} />
      {(file?.['progress'] ?? 1) >= 1 && <>{<fileType.paths />}</>}
    </svg>
  );
}
