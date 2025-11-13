import { memo, useMemo, useState } from 'react';
import { useRecoilValue } from 'recoil';
import {
  Spinner,
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandleAlt,
  useMediaQuery,
} from '@librechat/client';
import { useParams } from 'react-router-dom';
import { buildTree } from 'librechat-data-provider';
import { useGetSharedMessages } from 'librechat-data-provider/react-query';
import { useLocalize, useDocumentTitle } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';
import { ShareContext, ArtifactsProvider, EditorProvider } from '~/Providers';
import Artifacts from '~/components/Artifacts/Artifacts';
import MessagesView from './MessagesView';
import Footer from '../Chat/Footer';
import store from '~/store';
import { getLatestText } from '~/utils';
import type { ArtifactsContextValue } from '~/Providers';

const ARTIFACT_PANEL_WIDTH = 420;
const DEFAULT_ARTIFACT_PANEL_SIZE = 32;
const SHARE_ARTIFACT_PANEL_STORAGE_KEY = 'share:artifacts-panel-size';

function SharedView() {
  const localize = useLocalize();
  const { data: config } = useGetStartupConfig();
  const { shareId } = useParams();
  const { data, isLoading } = useGetSharedMessages(shareId ?? '');
  const dataTree = data && buildTree({ messages: data.messages });
  const messagesTree = dataTree?.length === 0 ? null : (dataTree ?? null);

  const artifacts = useRecoilValue(store.artifactsState);
  const artifactsVisibility = useRecoilValue(store.artifactsVisibility);

  // configure document title
  let docTitle = '';
  if (config?.appTitle != null && data?.title != null) {
    docTitle = `${data.title} | ${config.appTitle}`;
  } else {
    docTitle = data?.title ?? config?.appTitle ?? document.title;
  }

  useDocumentTitle(docTitle);

  const artifactsContextValue = useMemo<ArtifactsContextValue | null>(() => {
    if (!data) {
      return null;
    }

    const latestMessage =
      Array.isArray(data.messages) && data.messages.length > 0
        ? data.messages[data.messages.length - 1]
        : null;

    return {
      isSubmitting: false,
      latestMessageId: latestMessage?.messageId ?? null,
      latestMessageText: latestMessage ? getLatestText(latestMessage) : '',
      conversationId: data.conversationId ?? null,
    };
  }, [data]);

  const shouldRenderArtifacts =
    artifactsVisibility === true &&
    artifactsContextValue != null &&
    Object.keys(artifacts ?? {}).length > 0;

  const isSmallScreen = useMediaQuery('(max-width: 1023px)');
  const [artifactPanelSize, setArtifactPanelSize] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_ARTIFACT_PANEL_SIZE;
    }
    const stored = window.localStorage.getItem(SHARE_ARTIFACT_PANEL_STORAGE_KEY);
    const parsed = Number(stored);
    return Number.isFinite(parsed) ? parsed : DEFAULT_ARTIFACT_PANEL_SIZE;
  });

  const normalizedArtifactSize = Math.min(60, Math.max(20, artifactPanelSize));

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

  let content: JSX.Element;
  if (isLoading) {
    content = (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="" />
      </div>
    );
  } else if (data && messagesTree && messagesTree.length !== 0) {
    content = (
      <>
        <div className="final-completion group mx-auto flex min-w-[40rem] flex-col gap-3 pb-6 pt-4 md:max-w-[47rem] md:px-5 lg:px-1 xl:max-w-[55rem] xl:px-5">
          <h1 className="text-4xl font-bold">{data.title}</h1>
          {data.createdAt && (
            <div className="border-b border-border-medium pb-6 text-base text-text-secondary">
              {new Date(data.createdAt).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
          )}
        </div>

        <MessagesView messagesTree={messagesTree} conversationId={data.conversationId} />
      </>
    );
  } else {
    content = (
      <div className="flex h-screen items-center justify-center">
        {localize('com_ui_shared_link_not_found')}
      </div>
    );
  }

  const footer = (
    <div className="w-full border-t-0 pl-0 pt-2 md:w-[calc(100%-.5rem)] md:border-t-0 md:border-transparent md:pl-0 md:pt-0 md:dark:border-transparent">
      <Footer className="relative mx-auto mt-4 flex max-w-[55rem] flex-wrap items-center justify-center gap-2 px-3 pb-4 pt-2 text-center text-xs text-text-secondary" />
    </div>
  );

  const mainContent = (
    <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden pt-0 dark:bg-surface-secondary">
      <div className="flex h-full flex-col text-text-primary" role="presentation">
        {content}
        {footer}
      </div>
    </div>
  );

  const renderDesktopLayout = () => {
    if (!shouldRenderArtifacts || !artifactsContextValue || isSmallScreen) {
      return null;
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
  };

  return (
    <ShareContext.Provider value={{ isSharedConvo: true }}>
      <div className="relative flex min-h-screen w-full dark:bg-surface-secondary">
        <main className="relative flex w-full grow overflow-hidden dark:bg-surface-secondary">
          {renderDesktopLayout() ?? mainContent}
        </main>
        {shouldRenderArtifacts && artifactsContextValue && isSmallScreen && (
          <ShareArtifactsOverlay contextValue={artifactsContextValue} />
        )}
      </div>
    </ShareContext.Provider>
  );
}

interface ShareArtifactsOverlayProps {
  contextValue: ArtifactsContextValue;
}

function ShareArtifactsOverlay({ contextValue }: ShareArtifactsOverlayProps) {
  return (
    <div
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-full sm:max-w-[480px]"
      role="complementary"
      aria-label="Artifacts panel"
      style={{ maxWidth: `${ARTIFACT_PANEL_WIDTH}px` }}
    >
      <ShareArtifactsPanel contextValue={contextValue} />
    </div>
  );
}

function ShareArtifactsPanel({ contextValue }: ShareArtifactsOverlayProps) {
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

export default memo(SharedView);
