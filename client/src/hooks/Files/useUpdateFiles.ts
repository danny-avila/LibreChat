import type { ExtendedFile, FileSetter } from '~/common';
import useSetFilesToDelete from './useSetFilesToDelete';

export default function useUpdateFiles(setFiles: FileSetter) {
  const setFilesToDelete = useSetFilesToDelete();

  const addFile = (newFile: ExtendedFile) => {
    setFiles((currentFiles) => new Map(currentFiles).set(newFile.file_id, newFile));
  };

  const updateFileById = (fileId: string, updates: Partial<ExtendedFile>, isEntityFile = false) => {
    setFiles((currentFiles) => {
      if (!currentFiles.has(fileId)) {
        console.warn(`File with id ${fileId} not found.`);
        return currentFiles;
      }

      const updatedFiles = new Map(currentFiles);
      const currentFile = updatedFiles.get(fileId);
      if (!currentFile) {
        console.warn(`File with id ${fileId} not found.`);
        return currentFiles;
      }
      updatedFiles.set(fileId, { ...currentFile, ...updates });
      const filepath = updates['filepath'] ?? '';
      if (filepath && updates['progress'] !== 1 && !isEntityFile) {
        const files = Object.fromEntries(updatedFiles);
        setFilesToDelete(files);
      }

      return updatedFiles;
    });
  };

  const deleteFileById = (fileId: string) => {
    setFiles((currentFiles) => {
      const updatedFiles = new Map(currentFiles);
      if (updatedFiles.has(fileId)) {
        updatedFiles.delete(fileId);
      } else {
        console.warn(`File with id ${fileId} not found.`);
      }

      const files = Object.fromEntries(updatedFiles);
      setFilesToDelete(files);
      return updatedFiles;
    });
  };

  return {
    addFile,
    updateFileById,
    deleteFileById,
  };
}
