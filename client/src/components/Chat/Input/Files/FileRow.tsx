import { useEffect } from 'react';
import type { ExtendedFile } from '~/common';
import { useDeleteFilesMutation } from '~/data-provider';
import { useFileDeletion } from '~/hooks/Files';
import FileContainer from './FileContainer';
import Image from './Image';

export default function FileRow({
  files: _files,
  setFiles,
  setFilesLoading,
}: {
  files: Map<string, ExtendedFile>;
  setFiles: React.Dispatch<React.SetStateAction<Map<string, ExtendedFile>>>;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const files = Array.from(_files.values());
  const { mutateAsync } = useDeleteFilesMutation({
    onSuccess: () => {
      console.log('Files deleted');
    },
    onError: (error) => {
      console.log('Error deleting files:', error);
    },
  });

  const { deleteFile } = useFileDeletion({ mutateAsync });

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

  if (files.length === 0) {
    return null;
  }

  return (
    <div className="mx-2 mt-2 flex flex-wrap gap-2 px-2.5 md:pl-0 md:pr-4">
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
          const handleDelete = () => deleteFile({ file, setFiles });
          if (file.type?.startsWith('image')) {
            return (
              <Image
                key={index}
                url={file.preview}
                onDelete={handleDelete}
                progress={file.progress}
              />
            );
          }

          return <FileContainer key={index} file={file} onDelete={handleDelete} />;
        })}
    </div>
  );
}
