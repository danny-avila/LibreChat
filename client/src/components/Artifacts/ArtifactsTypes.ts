import type { SandpackPreviewRef, CodeEditorRef } from '@codesandbox/sandpack-react';
import type { Artifact } from '~/common';

export interface ArtifactsSharedProps {
  currentArtifact: Artifact;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentIndex: number;
  orderedArtifactIds: string[];
  setCurrentArtifactId: (id: string) => void;
  editorRef: React.MutableRefObject<CodeEditorRef>;
  previewRef: React.MutableRefObject<SandpackPreviewRef>;
  isMutating: boolean;
  onClose: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export interface TabOption {
  value: string;
  label: string;
  icon: React.ReactNode;
}
