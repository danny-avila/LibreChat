import { useEffect } from 'react';
import { EToolResources } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { useDeleteFilesMutation } from '~/data-provider';
import { useFileDeletion } from '~/hooks/Files';
import FileContainer from './FileContainer';
import { logger } from '~/utils';
import Image from './Image';

export default function FileRow({
  files: _files,
  setFiles,
  abortUpload,
  setFilesLoading,
  assistant_id,
  agent_id,
  tool_resource,
  fileFilter,
  isRTL = false,
  Wrapper,
}: {
  files: Map<string, ExtendedFile> | undefined;
  abortUpload?: () => void;
  setFiles: React.Dispatch<React.SetStateAction<Map<string, ExtendedFile>>>;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  fileFilter?: (file: ExtendedFile) => boolean;
  assistant_id?: string;
  agent_id?: string;
  tool_resource?: EToolResources;
  isRTL?: boolean;
  Wrapper?: React.FC<{ children: React.ReactNode }>;
}) {
  const files = Array.from(_files?.values() ?? []).filter((file) =>
    fileFilter ? fileFilter(file) : true,
  );

  const { mutateAsync } = useDeleteFilesMutation({
    onMutate: async () =>
      logger.log(
        'agents',
        'Deleting files: agent_id, assistant_id, tool_resource',
        agent_id,
        assistant_id,
        tool_resource,
      ),
    onSuccess: () => {
      console.log('Files deleted');
    },
    onError: (error) => {
      console.log('Error deleting files:', error);
    },
  });

  const { deleteFile } = useFileDeletion({ mutateAsync, agent_id, assistant_id, tool_resource });

  useEffect(() => {
    if (files.length === 0) {
      return;
    }

    if (files.some((file) => file.progress < 1)) {
      return;
    }

    if (files.every((file) => file.progress === 1)) {
      setFilesLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  if (files.length === 0) {
    return null;
  }

  const renderFiles = () => {
    const rowStyle = isRTL
      ? { display: 'flex', flexDirection: 'row-reverse', gap: '4px' }
      : { display: 'flex', gap: '4px' };

    return (
      <div style={rowStyle as React.CSSProperties}>
        {files
          .reduce(
            (acc, current) => {
              if (!acc.map.has(current.file_id)) {
                acc.map.set(current.file_id, true);
                acc.uniqueFiles.push(current);
              }
              return acc;
            },
            { map: new Map(), uniqueFiles: [] as ExtendedFile[] },
          )
          .uniqueFiles.map((file: ExtendedFile, index: number) => {
            const handleDelete = () => {
              if (abortUpload && file.progress < 1) {
                abortUpload();
              }
              deleteFile({ file, setFiles });
            };
            const isImage = file.type?.startsWith('image') ?? false;
            if (isImage) {
              return (
                <Image
                  key={index}
                  url={file.preview ?? file.filepath}
                  onDelete={handleDelete}
                  progress={file.progress}
                  source={file.source}
                />
              );
            }
            return <FileContainer key={index} file={file} onDelete={handleDelete} />;
          })}
      </div>
    );
  };

  if (Wrapper) {
    return <Wrapper>{renderFiles()}</Wrapper>;
  }

  return renderFiles();
}
