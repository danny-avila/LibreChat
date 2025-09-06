import { useEffect } from 'react';
import { useToastContext } from '@librechat/client';
import { FileSources } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import FileContainer from '~/components/Chat/Input/Files/FileContainer';
import { useDeleteFilesMutation } from '~/data-provider';
import Image from '~/components/Chat/Input/Files/Image';
import { useLocalize } from '~/hooks';
import { logger } from '~/utils';

export default function PromptFile({
  files: _files,
  setFiles,
  abortUpload,
  setFilesLoading,
  onFileRemove,
  fileFilter,
  isRTL = false,
  Wrapper,
}: {
  files: Map<string, ExtendedFile> | undefined;
  abortUpload?: () => void;
  setFiles: React.Dispatch<React.SetStateAction<Map<string, ExtendedFile>>>;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  onFileRemove?: (fileId: string) => void;
  fileFilter?: (file: ExtendedFile) => boolean;
  isRTL?: boolean;
  Wrapper?: React.FC<{ children: React.ReactNode }>;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const files = Array.from(_files?.values() ?? []).filter((file) =>
    fileFilter ? fileFilter(file) : true,
  );

  const { mutateAsync } = useDeleteFilesMutation({
    onMutate: async () =>
      logger.log(
        'prompts',
        'Deleting prompt files',
        files.map((f) => f.file_id),
      ),
    onSuccess: () => {
      console.log('Prompt files deleted');
    },
    onError: (error) => {
      console.log('Error deleting prompt files:', error);
    },
  });

  useEffect(() => {
    if (files.length === 0) {
      setFilesLoading(false);
      return;
    }

    if (files.some((file) => file.progress < 1)) {
      setFilesLoading(true);
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
      ? {
          display: 'flex',
          flexDirection: 'row-reverse',
          flexWrap: 'wrap',
          gap: '4px',
          width: '100%',
          maxWidth: '100%',
        }
      : {
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          width: '100%',
          maxWidth: '100%',
        };

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
              showToast({
                message: localize('com_ui_deleting_file'),
                status: 'info',
              });

              if (abortUpload && file.progress < 1) {
                abortUpload();
              }

              if (onFileRemove) {
                onFileRemove(file.file_id);
              } else {
                mutateAsync({
                  files: [
                    {
                      file_id: file.file_id,
                      filepath: file.filepath || '',
                      embedded: file.embedded || false,
                      source: file.source || FileSources.local,
                    },
                  ],
                });

                setFiles((currentFiles) => {
                  const updatedFiles = new Map(currentFiles);
                  updatedFiles.delete(file.file_id);
                  if (file.temp_file_id) {
                    updatedFiles.delete(file.temp_file_id);
                  }
                  return updatedFiles;
                });
              }
            };

            const isImage = file.type?.startsWith('image') ?? false;

            return (
              <div
                key={index}
                style={{
                  flexBasis: '70px',
                  flexGrow: 0,
                  flexShrink: 0,
                }}
              >
                {isImage ? (
                  <Image
                    url={file.preview ?? file.filepath}
                    onDelete={handleDelete}
                    progress={file.progress}
                    source={file.source}
                  />
                ) : (
                  <FileContainer file={file} onDelete={handleDelete} />
                )}
              </div>
            );
          })}
      </div>
    );
  };

  if (Wrapper) {
    return <Wrapper>{renderFiles()}</Wrapper>;
  }

  return renderFiles();
}
