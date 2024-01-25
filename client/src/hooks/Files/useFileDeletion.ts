import debounce from 'lodash/debounce';
import { FileSources } from 'librechat-data-provider';
import { useCallback, useState, useEffect } from 'react';
import type { BatchFile, DeleteFilesResponse, DeleteFilesBody } from 'librechat-data-provider';
import type { UseMutateAsyncFunction } from '@tanstack/react-query';
import type { ExtendedFile, GenericSetter } from '~/common';
import useSetFilesToDelete from './useSetFilesToDelete';

type FileMapSetter = GenericSetter<Map<string, ExtendedFile>>;

const useFileDeletion = ({
  mutateAsync,
}: {
  mutateAsync: UseMutateAsyncFunction<DeleteFilesResponse, unknown, DeleteFilesBody, unknown>;
}) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_batch, setFileDeleteBatch] = useState<BatchFile[]>([]);
  const setFilesToDelete = useSetFilesToDelete();

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

  const deleteFile = useCallback(
    (_file: ExtendedFile, setFiles: FileMapSetter) => {
      const {
        file_id,
        progress,
        temp_file_id = '',
        filepath = '',
        source = FileSources.local,
      } = _file;
      if (progress < 1) {
        return;
      }
      const file: BatchFile = {
        file_id,
        filepath,
        source,
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
    },
    [debouncedDelete, setFilesToDelete],
  );

  return { deleteFile };
};

export default useFileDeletion;
