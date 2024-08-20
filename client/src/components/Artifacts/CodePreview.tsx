import FilePreview from '~/components/Chat/Input/Files/FilePreview';
import { getFileType } from '~/utils';

const CodePreview = ({
  code,
}: {
  code: string,
  onDelete?: () => void;
}) => {
  const fileType = getFileType('text/x-');

  return (
    <div className="group relative inline-block text-sm text-text-primary">
      <div className="relative overflow-hidden rounded-xl border border-border-medium">
        <div className="w-60 bg-surface-active p-2">
          <div className="flex flex-row items-center gap-2">
            <FilePreview fileType={fileType} className="relative" />
            <div className="overflow-hidden">
              <div className="truncate font-medium">{'Code Artifact'}</div>
              <div className="truncate text-text-secondary">{fileType.title}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodePreview;
