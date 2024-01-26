import { useCallback } from 'react';
import type { Row } from '@tanstack/react-table';
import type { TFile } from 'librechat-data-provider';
import ImagePreview from '~/components/Chat/Input/Files/ImagePreview';
import FilePreview from '~/components/Chat/Input/Files/FilePreview';
import { useFileMapContext, useChatContext } from '~/Providers';
import { useUpdateFiles } from '~/hooks/Files';
import { getFileType } from '~/utils';

export default function PanelFileCell({ row }: { row: Row<TFile> }) {
  const fileMap = useFileMapContext();
  const { setFiles } = useChatContext();
  const { addFile } = useUpdateFiles(setFiles);

  const handleFileClick = useCallback(() => {
    const file = row.original;
    const fileData = fileMap?.[file.file_id];
    if (!fileData) {
      return;
    }

    addFile({
      progress: 1,
      attached: true,
      file_id: fileData.file_id,
      filepath: fileData.filepath,
      preview: fileData.filepath,
      type: fileData.type,
      height: fileData.height,
      width: fileData.width,
      filename: fileData.filename,
      source: fileData.source,
      size: fileData.bytes,
    });
  }, [addFile, fileMap, row.original]);

  const file = row.original;
  if (file.type?.startsWith('image')) {
    return (
      <div
        onClick={handleFileClick}
        className="flex cursor-pointer gap-2 rounded-md dark:hover:bg-gray-900"
      >
        <ImagePreview
          url={file.filepath}
          className="h-10 w-10 shrink-0 overflow-hidden rounded-md"
        />
        <span className="self-center truncate text-xs">{file.filename}</span>
      </div>
    );
  }

  const fileType = getFileType(file.type);
  return (
    <div
      onClick={handleFileClick}
      className="flex cursor-pointer gap-2 rounded-md dark:hover:bg-gray-900"
    >
      {fileType && <FilePreview fileType={fileType} />}
      <span className="self-center truncate">{file.filename}</span>
    </div>
  );
}
