import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { FileSources, LocalStorageKeys } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { failedFileIdsFrom } from '~/utils';
import useResetArtifactsOnConversationChange from '~/hooks/Artifacts/useResetArtifactsOnConversationChange';
import DragDropWrapper from '~/components/Chat/Input/Files/DragDropWrapper';
import { EditorProvider, ArtifactsProvider } from '~/Providers';
import { useDeleteFilesMutation } from '~/data-provider';
import { SidePanelGroup } from '~/components/SidePanel';
import { useSetFilesToDelete } from '~/hooks';
import store from '~/store';

const Artifacts = lazy(() => import('~/components/Artifacts/Artifacts'));

export default function Presentation({ children }: { children: React.ReactNode }) {
  const artifacts = useRecoilValue(store.artifactsState);
  const artifactsVisibility = useRecoilValue(store.artifactsVisibility);
  // Render-gating the panel on `currentArtifactId != null` (in addition
  // to visibility + non-empty artifacts) means the side panel only opens
  // when *something* is actively focused. Conversation navigation
  // resets `currentArtifactId` to null, so the panel stays closed when
  // a user revisits an old conversation full of artifacts. New artifacts
  // arriving via SSE auto-focus through `ToolArtifactCard`'s mount effect
  // (gated on `isSubmitting`), restoring the legacy streaming UX.
  const currentArtifactId = useRecoilValue(store.currentArtifactId);

  useResetArtifactsOnConversationChange();

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
      artifactsVisibility === true &&
      currentArtifactId != null &&
      Object.keys(artifacts ?? {}).length > 0
    ) {
      return (
        <ArtifactsProvider>
          <EditorProvider>
            <Suspense fallback={null}>
              <Artifacts />
            </Suspense>
          </EditorProvider>
        </ArtifactsProvider>
      );
    }
    return null;
  }, [artifactsVisibility, artifacts, currentArtifactId]);

  return (
    <DragDropWrapper className="relative flex w-full grow overflow-hidden bg-presentation">
      <SidePanelGroup artifacts={artifactsElement}>
        <main className="flex h-full flex-col overflow-y-auto" role="main">
          {children}
        </main>
      </SidePanelGroup>
    </DragDropWrapper>
  );
}
