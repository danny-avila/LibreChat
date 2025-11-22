import { useState, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import {
  useMediaQuery,
  ResizablePanel,
  ResizableHandleAlt,
  ResizablePanelGroup,
} from '@librechat/client';
import type { TMessage } from 'librechat-data-provider';
import type { ArtifactsContextValue } from '~/Providers';
import { ArtifactsProvider, EditorProvider } from '~/Providers';
import Artifacts from '~/components/Artifacts/Artifacts';
import { getLatestText } from '~/utils';
import store from '~/store';

const DEFAULT_ARTIFACT_PANEL_SIZE = 40;
const SHARE_ARTIFACT_PANEL_STORAGE_KEY = 'share:artifacts-panel-size';
const SHARE_ARTIFACT_PANEL_DEFAULT_KEY = 'share:artifacts-panel-size-default';

/**
 * Gets the initial artifact panel size from localStorage or returns default
 */
const getInitialArtifactPanelSize = () => {
  if (typeof window === 'undefined') {
    return DEFAULT_ARTIFACT_PANEL_SIZE;
  }

  const defaultSizeString = String(DEFAULT_ARTIFACT_PANEL_SIZE);
  const storedDefault = window.localStorage.getItem(SHARE_ARTIFACT_PANEL_DEFAULT_KEY);

  if (storedDefault !== defaultSizeString) {
    window.localStorage.setItem(SHARE_ARTIFACT_PANEL_DEFAULT_KEY, defaultSizeString);
    window.localStorage.removeItem(SHARE_ARTIFACT_PANEL_STORAGE_KEY);
    return DEFAULT_ARTIFACT_PANEL_SIZE;
  }

  const stored = window.localStorage.getItem(SHARE_ARTIFACT_PANEL_STORAGE_KEY);
  const parsed = Number(stored);
  return Number.isFinite(parsed) ? parsed : DEFAULT_ARTIFACT_PANEL_SIZE;
};

interface ShareArtifactsContainerProps {
  messages: TMessage[];
  conversationId: string;
  mainContent: React.ReactNode;
}

/**
 * Container component that manages artifact visibility and layout for shared conversations
 */
export function ShareArtifactsContainer({
  messages,
  conversationId,
  mainContent,
}: ShareArtifactsContainerProps) {
  const artifacts = useRecoilValue(store.artifactsState);
  const artifactsVisibility = useRecoilValue(store.artifactsVisibility);
  const isSmallScreen = useMediaQuery('(max-width: 1023px)');
  const [artifactPanelSize, setArtifactPanelSize] = useState(getInitialArtifactPanelSize);

  const artifactsContextValue = useMemo<ArtifactsContextValue | null>(() => {
    const latestMessage =
      Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : null;

    if (!latestMessage) {
      return null;
    }

    const latestMessageText = getLatestText(latestMessage);

    return {
      isSubmitting: false,
      latestMessageId: latestMessage.messageId ?? null,
      latestMessageText,
      conversationId: conversationId ?? null,
    };
  }, [messages, conversationId]);

  const shouldRenderArtifacts =
    artifactsVisibility === true &&
    artifactsContextValue != null &&
    Object.keys(artifacts ?? {}).length > 0;

  const normalizedArtifactSize = Math.min(60, Math.max(20, artifactPanelSize));

  /**
   * Handles artifact panel resize and persists size to localStorage
   */
  const handleLayoutChange = (sizes: number[]) => {
    if (sizes.length < 2) {
      return;
    }
    const newSize = sizes[1];
    if (!Number.isFinite(newSize)) {
      return;
    }
    setArtifactPanelSize(newSize);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SHARE_ARTIFACT_PANEL_STORAGE_KEY, newSize.toString());
    }
  };

  if (!shouldRenderArtifacts || !artifactsContextValue) {
    return <>{mainContent}</>;
  }

  if (isSmallScreen) {
    return (
      <>
        {mainContent}
        <ShareArtifactsOverlay contextValue={artifactsContextValue} />
      </>
    );
  }

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="flex h-full w-full"
      onLayout={handleLayoutChange}
    >
      <ResizablePanel
        defaultSize={100 - normalizedArtifactSize}
        minSize={35}
        order={1}
        id="share-content"
      >
        {mainContent}
      </ResizablePanel>
      <ResizableHandleAlt withHandle className="bg-border-medium text-text-primary" />
      <ResizablePanel
        defaultSize={normalizedArtifactSize}
        minSize={20}
        maxSize={60}
        order={2}
        id="share-artifacts"
      >
        <ShareArtifactsPanel contextValue={artifactsContextValue} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

interface ShareArtifactsPanelProps {
  contextValue: ArtifactsContextValue;
}

/**
 * Panel that renders the artifacts UI within a resizable container
 */
function ShareArtifactsPanel({ contextValue }: ShareArtifactsPanelProps) {
  return (
    <ArtifactsProvider value={contextValue}>
      <EditorProvider>
        <div className="flex h-full w-full border-l border-border-light bg-surface-primary shadow-2xl">
          <Artifacts />
        </div>
      </EditorProvider>
    </ArtifactsProvider>
  );
}

/**
 * Mobile overlay that displays artifacts in a fixed position
 */
function ShareArtifactsOverlay({ contextValue }: ShareArtifactsPanelProps) {
  return (
    <div
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-full sm:max-w-[420px]"
      role="complementary"
      aria-label="Artifacts panel"
    >
      <ShareArtifactsPanel contextValue={contextValue} />
    </div>
  );
}
