import type { Row } from '@tanstack/react-table';
import type { TFile } from 'librechat-data-provider';
import ImagePreview from '~/components/Chat/Input/Files/ImagePreview';
import FilePreview from '~/components/Chat/Input/Files/FilePreview';
import { getFileType } from '~/utils';

export default function PanelFileCell({ row }: { row: Row<TFile> }) {
  const file = row.original;
  if (file.type?.startsWith('image')) {
    return (
      <div className="flex gap-2">
        <ImagePreview
          url={file.filepath}
          className="relative h-10 w-10 shrink-0 overflow-hidden"
          source={file.source}
        />
        <span className="self-center truncate text-xs">{file.filename}</span>
      </div>
    );
  }

  const fileType = getFileType(file.type);
  return (
    <div className="flex gap-2">
      {fileType && <FilePreview fileType={fileType} className="relative" file={file} />}
      <span className="self-center truncate">{file.filename}</span>
    </div>
  );
}
