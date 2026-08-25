import { useRecoilValue } from 'recoil';
import { useEffect, useMemo } from 'react';
import { useMediaQuery } from '@librechat/client';
import { FileSources, LocalStorageKeys } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { useDeleteFilesMutation } from '~/data-provider';
import DragDropWrapper from '~/components/Chat/Input/Files/DragDropWrapper';
import { EditorProvider, SidePanelProvider, ArtifactsProvider } from '~/Providers';
import Artifacts from '~/components/Artifacts/Artifacts';
import { SidePanelGroup } from '~/components/SidePanel';
import BklThreadPanel from '~/components/Chat/BklPanel/BklThreadPanel';
import { useSetFilesToDelete } from '~/hooks';
import store from '~/store';

export default function Presentation({ children }: { children: React.ReactNode }) {
  const artifacts = useRecoilValue(store.artifactsState);
  const artifactsVisibility = useRecoilValue(store.artifactsVisibility);

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
    // BKL: v2 키 — 우측 패널 상시 표시 이전(50/50 기본) 저장값을 무시한다
    const resizableLayout = localStorage.getItem('react-resizable-panels:layout:v2');
    return typeof resizableLayout === 'string' ? JSON.parse(resizableLayout) : undefined;
  }, []);
  const defaultCollapsed = useMemo(() => {
    const collapsedPanels = localStorage.getItem('react-resizable-panels:collapsed');
    return typeof collapsedPanels === 'string' ? JSON.parse(collapsedPanels) : true;
  }, []);
  const fullCollapse = useMemo(() => localStorage.getItem('fullPanelCollapse') === 'true', []);

  const activeBklSource = useRecoilValue(store.activeBklSource);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  /**
   * Memoize artifacts JSX to prevent recreating it on every render
   * This is critical for performance - prevents entire artifact tree from re-rendering
   */
  const artifactsElement = useMemo(() => {
    if (artifactsVisibility === true && Object.keys(artifacts ?? {}).length > 0) {
      return (
        <ArtifactsProvider>
          <EditorProvider>
            <Artifacts />
          </EditorProvider>
        </ArtifactsProvider>
      );
    }
    return null;
  }, [artifactsVisibility, artifacts]);

  /**
   * Right-side panel routing:
   * The BKL thread panel is ALWAYS visible on desktop — it renders the
   * conversation-level overview (mentioned files + cited chunks) and swaps
   * to the chunk text view when a `[N]` citation is active. Artifacts (if
   * any) only take the slot when no citation is open.
   *
   * On small screens `SidePanelGroup` renders this slot as a `fixed inset-0`
   * overlay, so an always-open panel would cover the whole chat — mobile
   * therefore only mounts the panel while a citation chunk view is active
   * (same behaviour as before).
   */
  const sidePanelElement = useMemo(() => {
    if (activeBklSource != null) {
      return <BklThreadPanel />;
    }
    if (artifactsElement != null) {
      return artifactsElement;
    }
    return isSmallScreen ? null : <BklThreadPanel />;
  }, [activeBklSource, artifactsElement, isSmallScreen]);

  return (
    <DragDropWrapper className="relative flex w-full grow overflow-hidden bg-presentation">
      <SidePanelProvider>
        <SidePanelGroup
          defaultLayout={defaultLayout}
          fullPanelCollapse={fullCollapse}
          defaultCollapsed={defaultCollapsed}
          artifacts={sidePanelElement}
        >
          <main className="flex h-full flex-col overflow-y-auto" role="main">
            {children}
          </main>
        </SidePanelGroup>
      </SidePanelProvider>
    </DragDropWrapper>
  );
}
