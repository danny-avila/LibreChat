import { useEffect } from 'react';
import type { ExtendedFile } from '~/common';
import { useDragHelpers, useSetFilesToDelete } from '~/hooks';
import DragDropOverlay from './Input/Files/DragDropOverlay';
import { useDeleteFilesMutation } from '~/data-provider';

export default function Presentation({ children }: { children: React.ReactNode }) {
  const { isOver, canDrop, drop } = useDragHelpers();
  const setFilesToDelete = useSetFilesToDelete();
  const { mutateAsync } = useDeleteFilesMutation({
    onSuccess: () => {
      console.log('Temporary Files deleted');
      setFilesToDelete({});
    },
    onError: (error) => {
      console.log('Error deleting temporary files:', error);
    },
  });

  useEffect(() => {
    const filesToDelete = localStorage.getItem('filesToDelete');
    const map = JSON.parse(filesToDelete ?? '{}') as Record<string, ExtendedFile>;
    const files = Object.values(map)
      .filter((file) => file.filepath)
      .map((file) => ({
        file_id: file.file_id,
        filepath: file.filepath as string,
      }));

    if (files.length === 0) {
      return;
    }
    mutateAsync({ files });
  }, [mutateAsync]);

  const isActive = canDrop && isOver;
  return (
    <div ref={drop} className="relative flex w-full grow overflow-hidden bg-white dark:bg-gray-800">
      <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden bg-white pt-0 dark:bg-gray-800">
        <div className="flex h-full flex-col" role="presentation" tabIndex={0}>
          {children}
          {isActive && <DragDropOverlay />}
        </div>
      </div>
    </div>
  );
}
