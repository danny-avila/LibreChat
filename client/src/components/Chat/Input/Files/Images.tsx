import debounce from 'lodash/debounce';
import { useState, useEffect, useCallback } from 'react';
import type { BatchFile } from 'librechat-data-provider';
import { useDeleteFilesMutation } from '~/data-provider';
import { useSetFilesToDelete } from '~/hooks';
import { ExtendedFile } from '~/common';
import Image from './Image';

export default function Images({
  files: _files,
  setFiles,
  setFilesLoading,
}: {
  files: Map<string, ExtendedFile>;
  setFiles: React.Dispatch<React.SetStateAction<Map<string, ExtendedFile>>>;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const setFilesToDelete = useSetFilesToDelete();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_batch, setFileDeleteBatch] = useState<BatchFile[]>([]);
  const files = Array.from(_files.values());

  useEffect(() => {
    if (!files) {
      return;
    }

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

  const { mutateAsync } = useDeleteFilesMutation({
    onSuccess: () => {
      console.log('Files deleted');
    },
    onError: (error) => {
      console.log('Error deleting files:', error);
    },
  });

  const executeBatchDelete = useCallback(
    (filesToDelete: BatchFile[]) => {
      console.log('Deleting files:', filesToDelete);
      mutateAsync({ files: filesToDelete });
      setFileDeleteBatch([]);
    },
    [mutateAsync],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedDelete = useCallback(debounce(executeBatchDelete, 1000), []);

  useEffect(() => {
    // Cleanup function for debouncedDelete when component unmounts or before re-render
    return () => debouncedDelete.cancel();
  }, [debouncedDelete]);

  if (files.length === 0) {
    return null;
  }

  const deleteFile = (_file: ExtendedFile) => {
    const { file_id, progress, temp_file_id = '', filepath = '' } = _file;
    if (progress < 1) {
      return;
    }
    const file = {
      file_id,
      filepath,
    };

    setFiles((currentFiles) => {
      const updatedFiles = new Map(currentFiles);
      updatedFiles.delete(file_id);
      updatedFiles.delete(temp_file_id);
      const files = Object.fromEntries(updatedFiles);
      setFilesToDelete(files);
      return updatedFiles;
    });

    setFileDeleteBatch((prevBatch) => {
      const newBatch = [...prevBatch, file];
      debouncedDelete(newBatch);
      return newBatch;
    });
  };

  return (
    <div className="mx-2 mt-2 flex flex-wrap gap-2 px-2.5 md:pl-0 md:pr-4">
      {files.map((file: ExtendedFile, index: number) => {
        const handleDelete = () => deleteFile(file);
        return (
          <Image key={index} url={file.preview} onDelete={handleDelete} progress={file.progress} />
        );
      })}
    </div>
  );
}
