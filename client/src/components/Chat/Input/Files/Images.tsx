import { useState, useCallback, useMemo } from 'react';
import debounce from 'lodash/debounce';
import { ExtendedFile } from '~/common';
import Image from './Image';

export default function Images({
  files: _files,
  setFiles,
}: {
  files: Map<string, ExtendedFile>;
  setFiles: React.Dispatch<React.SetStateAction<Map<string, ExtendedFile>>>;
}) {
  const [fileDeleteBatch, setFileDeleteBatch] = useState<string[]>([]);
  const files = Array.from(_files.values());

  const executeBatchDelete = useCallback((filesToDelete: string[]) => {
    console.log('Deleting files:', filesToDelete);
    setFileDeleteBatch([]);
  }, []);

  const debouncedDelete = useMemo(() => debounce(executeBatchDelete, 1000), [executeBatchDelete]);

  if (files.length === 0) {
    return null;
  }

  const deleteFile = (fileId: string) => {
    setFiles((currentFiles) => {
      const updatedFiles = new Map(currentFiles);
      updatedFiles.delete(fileId);
      return updatedFiles;
    });
    setFileDeleteBatch((prevBatch) => [...prevBatch, fileId]);
    debouncedDelete(fileDeleteBatch);
  };

  return (
    <div className="mx-2 mt-2 flex flex-wrap gap-2 px-2.5 md:pl-0 md:pr-4">
      {files.map((file: ExtendedFile, index: number) => {
        const handleDelete = () => deleteFile(file.file_id);
        return (
          <Image key={index} url={file.preview} onDelete={handleDelete} progress={file.progress} />
        );
      })}
    </div>
  );
}
