import { useRecoilValue } from 'recoil';
import { useEffect, useMemo } from 'react';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import { FileSources, LocalStorageKeys, getConfigDefaults } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import DragDropWrapper from '~/components/Chat/Input/Files/DragDropWrapper';
import { useDeleteFilesMutation } from '~/data-provider';
import Artifacts from '~/components/Artifacts/Artifacts';
import { SidePanel } from '~/components/SidePanel';
import { useSetFilesToDelete } from '~/hooks';
import store from '~/store';

const defaultInterface = getConfigDefaults().interface;

export default function Presentation({
  children,
  useSidePanel = false,
  panel,
}: {
  children: React.ReactNode;
  panel?: React.ReactNode;
  useSidePanel?: boolean;
}) {
  const { data: startupConfig } = useGetStartupConfig();
  const artifacts = useRecoilValue(store.artifactsState);
  const codeArtifacts = useRecoilValue(store.codeArtifacts);
  const hideSidePanel = useRecoilValue(store.hideSidePanel);
  const artifactsVisible = useRecoilValue(store.artifactsVisible);

  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig],
  );

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
    const filesToDelete = localStorage.getItem(LocalStorageKeys.FILES_TO_DELETE);
    const map = JSON.parse(filesToDelete ?? '{}') as Record<string, ExtendedFile>;
    const files = Object.values(map)
      .filter(
        (file) =>
          file.filepath != null && file.source && !(file.embedded ?? false) && file.temp_file_id,
      )
      .map((file) => ({
        file_id: file.file_id,
        filepath: file.filepath as string,
        source: file.source as FileSources,
        embedded: !!(file.embedded ?? false),
      }));

    if (files.length === 0) {
      return;
    }
    mutateAsync({ files });
  }, [mutateAsync]);

  const defaultLayout = useMemo(() => {
    const resizableLayout = localStorage.getItem('react-resizable-panels:layout');
    return typeof resizableLayout === 'string' ? JSON.parse(resizableLayout) : undefined;
  }, []);
  const defaultCollapsed = useMemo(() => {
    const collapsedPanels = localStorage.getItem('react-resizable-panels:collapsed');
    return typeof collapsedPanels === 'string' ? JSON.parse(collapsedPanels) : true;
  }, []);
  const fullCollapse = useMemo(() => localStorage.getItem('fullPanelCollapse') === 'true', []);

  const layout = () => (
    <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden bg-presentation pt-0">
      <div className="flex h-full flex-col" role="presentation">
        {children}
      </div>
    </div>
  );

  if (useSidePanel && !hideSidePanel && interfaceConfig.sidePanel === true) {
    return (
      <DragDropWrapper className="relative flex w-full grow overflow-hidden bg-presentation">
        <SidePanel
          defaultLayout={defaultLayout}
          defaultCollapsed={defaultCollapsed}
          fullPanelCollapse={fullCollapse}
          artifacts={
            artifactsVisible === true &&
            codeArtifacts === true &&
            Object.keys(artifacts ?? {}).length > 0 ? (
                <Artifacts />
              ) : null
          }
        >
          <main className="flex h-full flex-col overflow-y-auto" role="main">
            {children}
          </main>
        </SidePanel>
      </DragDropWrapper>
    );
  }

  return (
    <DragDropWrapper className="relative flex w-full grow overflow-hidden bg-presentation">
      {layout()}
      {panel != null && panel}
    </DragDropWrapper>
  );
}
