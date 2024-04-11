import debounce from 'lodash/debounce';
import { FileSources } from 'librechat-data-provider';
import { useCallback, useState, useEffect } from 'react';
import type {
  BatchFile,
  TFile,
  DeleteFilesResponse,
  DeleteFilesBody,
} from 'librechat-data-provider';
import type { UseMutateAsyncFunction } from '@tanstack/react-query';
import type { ExtendedFile, GenericSetter } from '~/common';
import useSetFilesToDelete from './useSetFilesToDelete';

type FileMapSetter = GenericSetter<Map<string, ExtendedFile>>;

const useFileDeletion = ({
  mutateAsync,
  assistant_id,
}: {
  mutateAsync: UseMutateAsyncFunction<DeleteFilesResponse, unknown, DeleteFilesBody, unknown>;
  assistant_id?: string;
}) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_batch, setFileDeleteBatch] = useState<BatchFile[]>([]);
  const setFilesToDelete = useSetFilesToDelete();

  const executeBatchDelete = useCallback(
    (filesToDelete: BatchFile[], assistant_id?: string) => {
      console.log('Deleting files:', filesToDelete, assistant_id);
      mutateAsync({ files: filesToDelete, assistant_id });
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
    ({ file: _file, setFiles }: { file: ExtendedFile | TFile; setFiles?: FileMapSetter }) => {
      const {
        file_id,
        temp_file_id = '',
        filepath = '',
        source = FileSources.local,
        embedded,
        attached,
      } = _file as TFile & { attached?: boolean };

      const progress = _file['progress'] ?? 1;

      if (progress < 1) {
        return;
      }
      const file: BatchFile = {
        file_id,
        embedded,
        filepath,
        source,
      };

      if (setFiles) {
        setFiles((currentFiles) => {
          const updatedFiles = new Map(currentFiles);
          updatedFiles.delete(file_id);
          updatedFiles.delete(temp_file_id);
          const files = Object.fromEntries(updatedFiles);
          setFilesToDelete(files);
          return updatedFiles;
        });
      }

      if (attached) {
        return;
      }

      setFileDeleteBatch((prevBatch) => {
        const newBatch = [...prevBatch, file];
        debouncedDelete(newBatch, assistant_id);
        return newBatch;
      });
    },
    [debouncedDelete, setFilesToDelete, assistant_id],
  );

  const deleteFiles = useCallback(
    ({ files, setFiles }: { files: ExtendedFile[] | TFile[]; setFiles?: FileMapSetter }) => {
      const batchFiles = files.map((_file) => {
        const { file_id, embedded, filepath = '', source = FileSources.local } = _file;

        return {
          source,
          file_id,
          filepath,
          embedded,
        };
      });

      if (setFiles) {
        setFiles((currentFiles) => {
          const updatedFiles = new Map(currentFiles);
          batchFiles.forEach((file) => {
            updatedFiles.delete(file.file_id);
          });
          const filesToUpdate = Object.fromEntries(updatedFiles);
          setFilesToDelete(filesToUpdate);
          return updatedFiles;
        });
      }

      setFileDeleteBatch((prevBatch) => {
        const newBatch = [...prevBatch, ...batchFiles];
        debouncedDelete(newBatch, assistant_id);
        return newBatch;
      });
    },
    [debouncedDelete, setFilesToDelete, assistant_id],
  );

  return { deleteFile, deleteFiles };
};

export default useFileDeletion;
