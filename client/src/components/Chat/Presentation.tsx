import { useRecoilValue } from 'recoil';
import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useMediaQuery } from '@librechat/client';
import { FileSources, LocalStorageKeys } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { useDeleteFilesMutation } from '~/data-provider';
import DragDropWrapper from '~/components/Chat/Input/Files/DragDropWrapper';
import { EditorProvider, SidePanelProvider, ArtifactsProvider } from '~/Providers';
import Artifacts from '~/components/Artifacts/Artifacts';
import { SidePanelGroup } from '~/components/SidePanel';
import BklThreadPanel from '~/components/Chat/BklPanel/BklThreadPanel';
import { useSyncActiveBklSourceWithConversation } from '~/components/Chat/BklPanel/useActiveBklSource';
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
    // BKL: v3 키 — 기본 폭 20%→28% 상향 이전(v2) 저장값을 무시한다
    const resizableLayout = localStorage.getItem('react-resizable-panels:layout:v3');
    return typeof resizableLayout === 'string' ? JSON.parse(resizableLayout) : undefined;
  }, []);
  const defaultCollapsed = useMemo(() => {
    const collapsedPanels = localStorage.getItem('react-resizable-panels:collapsed');
    return typeof collapsedPanels === 'string' ? JSON.parse(collapsedPanels) : true;
  }, []);
  const fullCollapse = useMemo(() => localStorage.getItem('fullPanelCollapse') === 'true', []);

  const activeBklSource = useRecoilValue(store.activeBklSource);
  // 대화를 옮기면 열려 있던 청크를 닫는다. 패널은 조건부 마운트라 패널 안에서
  // 정리할 수 없어, 항상 마운트되는 여기서 한다.
  useSyncActiveBklSourceWithConversation();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  /**
   * "채팅에 들어간 상태" 판정 — 새 채팅 대기화면(설명 페이지)에서는 패널을
   * 숨기고, 쿼리를 제출한 순간부터 띄운다 (인용이 없으면 패널의 빈 상태
   * 문구가 보인다). 새 채팅은 답변이 끝나야 /c/{id} 로 라우트가 바뀌므로
   * (finalHandler 의 navigate), 라우트만 보면 첫 답변 내내 패널이 없다가
   * 완료 후에야 나타난다 — 제출 중(isSubmitting)이면 바로 띄운다.
   */
  const { conversationId } = useParams();
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(0));
  const chatStarted = (conversationId != null && conversationId !== 'new') || isSubmitting;

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
   * The BKL thread panel is always visible on desktop once the user has
   * entered a chat — i.e. an existing conversation route, or a new chat
   * right after the first query is submitted (2026-08-26 사용자 결정:
   * 대기화면에서는 숨기고, 채팅 치고 들어가면 빈 상태 문구라도 바로 띄운다).
   * It renders the conversation-level overview (mentioned files + cited
   * chunks) and swaps to the chunk text view when a `[N]` citation is
   * active. Artifacts (if any) only take the slot when no citation is open.
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
    return isSmallScreen || !chatStarted ? null : <BklThreadPanel />;
  }, [activeBklSource, artifactsElement, isSmallScreen, chatStarted]);

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
