import type { Row } from '@tanstack/react-table';
import type { TFile } from 'librechat-data-provider';
import ImagePreview from '~/components/Chat/Input/Files/ImagePreview';
import FilePreview from '~/components/Chat/Input/Files/FilePreview';
import { getFileType } from '~/utils';

export default function PanelFileCell({ row }: { row: Row<TFile> }) {
  const file = row.original;

  return (
    <div className="flex items-center gap-2">
      {file.type.startsWith('image') ? (
        <ImagePreview
          url={file.filepath}
          className="h-10 w-10"
          source={file.source}
          alt={file.filename}
        />
      ) : (
        <FilePreview fileType={getFileType(file.type)} file={file} />
      )}
      <span className="truncate text-xs">{file.filename}</span>
    </div>
  );
}
