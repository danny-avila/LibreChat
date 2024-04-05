import { useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { FileSources } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { useDragHelpers, useSetFilesToDelete } from '~/hooks';
import DragDropOverlay from './Input/Files/DragDropOverlay';
import { useDeleteFilesMutation } from '~/data-provider';
import { SidePanel } from '~/components/SidePanel';
import store from '~/store';

export default function Presentation({
  children,
  useSidePanel = false,
  panel,
}: {
  children: React.ReactNode;
  panel?: React.ReactNode;
  useSidePanel?: boolean;
}) {
  const hideSidePanel = useRecoilValue(store.hideSidePanel);
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
        source: file.source as FileSources,
      }));

    if (files.length === 0) {
      return;
    }
    mutateAsync({ files });
  }, [mutateAsync]);

  const isActive = canDrop && isOver;
  const resizableLayout = localStorage.getItem('react-resizable-panels:layout');
  const collapsedPanels = localStorage.getItem('react-resizable-panels:collapsed');

  const defaultLayout = resizableLayout ? JSON.parse(resizableLayout) : undefined;
  const defaultCollapsed = collapsedPanels ? JSON.parse(collapsedPanels) : undefined;

  const layout = () => (
    <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden bg-white pt-0 dark:bg-gray-800">
      <div className="flex h-full flex-col" role="presentation" tabIndex={0}>
        {children}
        {isActive && <DragDropOverlay />}
      </div>
    </div>
  );

  if (useSidePanel && !hideSidePanel) {
    return (
      <div
        ref={drop}
        className="relative flex w-full grow overflow-hidden bg-white dark:bg-gray-800"
      >
        <SidePanel defaultLayout={defaultLayout} defaultCollapsed={defaultCollapsed}>
          <div className="flex h-full flex-col" role="presentation" tabIndex={0}>
            {children}
            {isActive && <DragDropOverlay />}
          </div>
        </SidePanel>
      </div>
    );
  }

  return (
    <div ref={drop} className="relative flex w-full grow overflow-hidden bg-white dark:bg-gray-800">
      {layout()}
      {panel && panel}
    </div>
  );
}
