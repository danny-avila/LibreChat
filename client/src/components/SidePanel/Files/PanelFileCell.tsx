import type { Row } from '@tanstack/react-table';
import type { TFile } from 'librechat-data-provider';
import ImagePreview from '~/components/Chat/Input/Files/ImagePreview';
import FilePreview from '~/components/Chat/Input/Files/FilePreview';
import { getFileType } from '~/utils';

export default function PanelFileCell({ row }: { row: Row<TFile | undefined> }) {
  const file = row.original;

  return (
    <div className="flex w-full items-center gap-2">
      {file?.type.startsWith('image') === true ? (
        <ImagePreview
          url={file.filepath}
          className="h-10 w-10 flex-shrink-0"
          source={file.source}
          alt={file.filename}
        />
      ) : (
        <FilePreview fileType={getFileType(file?.type)} file={file} />
      )}
      <div className="min-w-0 flex-1 overflow-hidden">
        <span className="block w-full overflow-hidden truncate text-ellipsis whitespace-nowrap text-xs">
          {file?.filename}
        </span>
      </div>
    </div>
  );
}
