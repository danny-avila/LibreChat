import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { BatchFile, TFile } from 'librechat-data-provider';
import { useDeleteFilesMutation } from '~/data-provider';
import useFileDeletion from './useFileDeletion';

export default function useDeleteFilesFromTable(callback?: () => void) {
  const queryClient = useQueryClient();
  const deletionMutation = useDeleteFilesMutation({
    onMutate: async (variables) => {
      const { files } = variables;
      if (!files.length) {
        return new Map<string, BatchFile>();
      }

      const filesToDeleteMap = files.reduce((map, file) => {
        map.set(file.file_id, file);
        return map;
      }, new Map<string, BatchFile>());

      return { filesToDeleteMap };
    },
    onSuccess: (data, variables, context) => {
      console.log('Files deleted');
      const { filesToDeleteMap } = context as { filesToDeleteMap: Map<string, BatchFile> };

      queryClient.setQueryData([QueryKeys.files], (oldFiles: TFile[] | undefined) => {
        const { files } = variables;
        return files.length
          ? oldFiles?.filter((file) => !filesToDeleteMap.has(file.file_id))
          : oldFiles;
      });
      callback?.();
    },
    onError: (error) => {
      console.log('Error deleting files:', error);
      callback?.();
    },
  });

  return useFileDeletion({ mutateAsync: deletionMutation.mutateAsync });
}
