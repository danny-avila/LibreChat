import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { useRecoilValue, useResetRecoilState } from 'recoil';
import { EModelEndpoint, FileSources, LocalStorageKeys } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import useResetArtifactsOnConversationChange from '~/hooks/Artifacts/useResetArtifactsOnConversationChange';
import { ParentSubagentsProvider } from '~/components/Chat/Subagents/ParentSubagentsProvider';
import ArtifactCatalogRegistrar from '~/components/ArtifactApps/ArtifactCatalogRegistrar';
import { artifactNavigationRequestAtom } from '~/components/ArtifactApps/navigation';
import DragDropWrapper from '~/components/Chat/Input/Files/DragDropWrapper';
import { activeSubagentPanel } from '~/components/Chat/Subagents/state';
import { EditorProvider, ArtifactsProvider } from '~/Providers';
import { useDeleteFilesMutation } from '~/data-provider';
import { SidePanelGroup } from '~/components/SidePanel';
import AppChatSurface from '~/components/Chat/Surface';
import { useSetFilesToDelete } from '~/hooks';
import { failedFileIdsFrom } from '~/utils';
import store from '~/store';

const Artifacts = lazy(() => import('~/components/Artifacts/Artifacts'));
const SubagentThreadPanel = lazy(() => import('~/components/Chat/Subagents/SubagentThreadPanel'));

export default function Presentation({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const artifacts = useRecoilValue(store.artifactsState);
  const artifactsVisibility = useRecoilValue(store.artifactsVisibility);
  // Idle history stays closed unless an artifact is focused. A catalog
  // deep link temporarily bypasses that gate so `useArtifacts` can resolve
  // the requested source and focus it after the conversation has rendered.
  const currentArtifactId = useRecoilValue(store.currentArtifactId);
  const conversationId = useRecoilValue(store.conversationIdByIndex(0));
  const conversationEndpoint = useRecoilValue(store.effectiveEndpointByIndex(0));
  const conversationAgentId = useRecoilValue(store.conversationAgentIdByIndex(0));
  const selectedSubagent = useAtomValue(activeSubagentPanel);
  const setSelectedSubagent = useSetAtom(activeSubagentPanel);
  const resetSelectedSubagent = useCallback(() => setSelectedSubagent(null), [setSelectedSubagent]);
  const previousConversationIdRef = useRef<string | null>(null);
  const artifactNavigationRequest = useAtomValue(artifactNavigationRequestAtom);
  const resetArtifacts = useResetRecoilState(store.artifactsState);
  const resetCurrentArtifactId = useResetRecoilState(store.currentArtifactId);
  const handledArtifactRequestRef = useRef<string | null>(null);
  const hasStateArtifactRequest =
    artifactNavigationRequest != null &&
    location.pathname.endsWith(`/c/${artifactNavigationRequest.conversationId}`);
  const hasArtifactRequest = useMemo(
    () => new URLSearchParams(location.search).has('artifact') || hasStateArtifactRequest,
    [hasStateArtifactRequest, location.search],
  );

  useResetArtifactsOnConversationChange();

  useEffect(() => {
    const previous = previousConversationIdRef.current;
    const next = conversationId ?? null;
    previousConversationIdRef.current = next;
    if (previous != null && previous !== next) resetSelectedSubagent();
  }, [conversationId, resetSelectedSubagent]);

  useEffect(() => {
    if (!hasArtifactRequest) {
      handledArtifactRequestRef.current = null;
      return;
    }
    const requestKey = `${location.key}:${location.search}:${artifactNavigationRequest?.sourceKey ?? ''}`;
    if (handledArtifactRequestRef.current === requestKey) {
      return;
    }
    handledArtifactRequestRef.current = requestKey;
    resetArtifacts();
    resetCurrentArtifactId();
  }, [
    hasArtifactRequest,
    location.key,
    location.search,
    resetArtifacts,
    resetCurrentArtifactId,
    artifactNavigationRequest?.sourceKey,
  ]);

  const setFilesToDelete = useSetFilesToDelete();

  const { mutateAsync } = useDeleteFilesMutation({
    onSuccess: (result) => {
      console.log('Temporary Files deleted');
      const failed = new Set(failedFileIdsFrom(result));
      if (failed.size === 0) {
        setFilesToDelete({});
        return;
      }
      try {
        const filesToDelete = localStorage.getItem(LocalStorageKeys.FILES_TO_DELETE);
        const map = JSON.parse(filesToDelete ?? '{}') as Record<string, ExtendedFile>;
        const remaining: Record<string, ExtendedFile> = {};
        for (const [key, file] of Object.entries(map)) {
          if (
            (file.file_id != null && failed.has(file.file_id)) ||
            (file.temp_file_id != null && failed.has(file.temp_file_id))
          ) {
            remaining[key] = file;
          }
        }
        setFilesToDelete(remaining);
      } catch {
        // Keep existing records if reading or parsing fails.
      }
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

  const artifactsElement = useMemo(() => {
    if (
      (artifactsVisibility === true || hasArtifactRequest) &&
      (currentArtifactId != null || hasArtifactRequest) &&
      Object.keys(artifacts ?? {}).length > 0
    ) {
      return (
        <EditorProvider>
          <Suspense fallback={null}>
            <Artifacts />
          </Suspense>
        </EditorProvider>
      );
    }
    return null;
  }, [artifactsVisibility, artifacts, currentArtifactId, hasArtifactRequest]);

  useEffect(() => {
    if (artifactsElement != null && selectedSubagent != null) resetSelectedSubagent();
  }, [artifactsElement, resetSelectedSubagent, selectedSubagent]);

  const subagentElement = useMemo(() => {
    if (
      selectedSubagent == null ||
      selectedSubagent.host !== 'conversation' ||
      selectedSubagent.parentConversationId !== conversationId
    ) {
      return null;
    }
    return (
      <Suspense fallback={null}>
        <SubagentThreadPanel selection={selectedSubagent} />
      </Suspense>
    );
  }, [conversationId, selectedSubagent]);

  const panelElement = artifactsElement ?? subagentElement;

  return (
    <ArtifactsProvider>
      <ArtifactCatalogRegistrar />
      <DragDropWrapper className="relative flex w-full grow overflow-hidden bg-presentation">
        <AppChatSurface>
          <ParentSubagentsProvider
            conversationId={conversationId ?? ''}
            enabled={conversationEndpoint === EModelEndpoint.agents && conversationAgentId != null}
          >
            <SidePanelGroup panel={panelElement}>
              <main className="flex h-full flex-col overflow-y-auto" role="main">
                {children}
              </main>
            </SidePanelGroup>
          </ParentSubagentsProvider>
        </AppChatSurface>
      </DragDropWrapper>
    </ArtifactsProvider>
  );
}
