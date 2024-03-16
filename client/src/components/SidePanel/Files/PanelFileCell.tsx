import { useCallback } from 'react';
import {
  fileConfig as defaultFileConfig,
  mergeFileConfig,
  megabyte,
} from 'librechat-data-provider';
import type { Row } from '@tanstack/react-table';
import type { TFile } from 'librechat-data-provider';
import { useFileMapContext, useChatContext, useToastContext } from '~/Providers';
import ImagePreview from '~/components/Chat/Input/Files/ImagePreview';
import FilePreview from '~/components/Chat/Input/Files/FilePreview';
import { useUpdateFiles, useLocalize } from '~/hooks';
import { useGetFileConfig } from '~/data-provider';
import { getFileType } from '~/utils';

export default function PanelFileCell({ row }: { row: Row<TFile> }) {
  const localize = useLocalize();
  const fileMap = useFileMapContext();
  const { showToast } = useToastContext();
  const { setFiles, conversation } = useChatContext();
  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });
  const { addFile } = useUpdateFiles(setFiles);

  const handleFileClick = useCallback(() => {
    const file = row.original;
    const endpoint = conversation?.endpoint;
    const fileData = fileMap?.[file.file_id];

    if (!fileData) {
      return;
    }

    if (!endpoint) {
      return showToast({ message: localize('com_ui_attach_error'), status: 'error' });
    }

    const { fileSizeLimit, supportedMimeTypes } =
      fileConfig.endpoints[endpoint] ?? fileConfig.endpoints.default;

    if (fileData.bytes > fileSizeLimit) {
      return showToast({
        message: `${localize('com_ui_attach_error_size')} ${
          fileSizeLimit / megabyte
        } MB (${endpoint})`,
        status: 'error',
      });
    }

    const isSupportedMimeType = defaultFileConfig.checkType(file.type, supportedMimeTypes);

    if (!isSupportedMimeType) {
      return showToast({
        message: `${localize('com_ui_attach_error_type')} ${file.type} (${endpoint})`,
        status: 'error',
      });
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
  }, [addFile, fileMap, row.original, conversation, localize, showToast, fileConfig.endpoints]);

  const file = row.original;
  if (file.type?.startsWith('image')) {
    return (
      <div
        onClick={handleFileClick}
        className="flex cursor-pointer gap-2 rounded-md dark:hover:bg-gray-700"
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
