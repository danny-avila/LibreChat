import { useRef, useState, useEffect } from 'react';
import { useSetRecoilState } from 'recoil';
import * as Tabs from '@radix-ui/react-tabs';
import { Code, Play, RefreshCw, X } from 'lucide-react';
import type { SandpackPreviewRef, CodeEditorRef } from '@codesandbox/sandpack-react';
import useArtifacts from '~/hooks/Artifacts/useArtifacts';
import DownloadArtifact from './DownloadArtifact';
import ArtifactVersion from './ArtifactVersion';
import { useEditorContext } from '~/Providers';
import { Button, Spinner } from '~/components';
import ArtifactTabs from './ArtifactTabs';
import { useMediaQuery } from '~/hooks';
import { CopyCodeButton } from './Code';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function Artifacts() {
  const localize = useLocalize();
  const { isMutating } = useEditorContext();
  const isMobile = useMediaQuery('(max-width: 868px)'); // DO NOT change this value, it is used to determine the layout of the artifacts panel ONLY
  const editorRef = useRef<CodeEditorRef>();
  const previewRef = useRef<SandpackPreviewRef>();
  const [isVisible, setIsVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const setArtifactsVisible = useSetRecoilState(store.artifactsVisibility);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const {
    activeTab,
    isMermaid,
    setActiveTab,
    currentIndex,
    isSubmitting,
    currentArtifact,
    orderedArtifactIds,
    setCurrentArtifactId,
  } = useArtifacts();

  if (!currentArtifact) {
    return null;
  }

  const handleRefresh = () => {
    setIsRefreshing(true);
    const client = previewRef.current?.getClient();
    if (client) {
      client.dispatch({ type: 'refresh' });
    }
    setTimeout(() => setIsRefreshing(false), 750);
  };

  const closeArtifacts = () => {
    setIsVisible(false);
    setTimeout(() => setArtifactsVisible(false), 300);
  };

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab} asChild>
      <div className="flex h-full w-full items-center justify-center">
        <div
          className={`flex flex-col overflow-hidden bg-surface-primary text-xl text-text-primary shadow-xl transition-all duration-500 ease-in-out ${
            isVisible ? 'opacity-100 blur-0' : 'opacity-0 blur-sm'
          } ${isMobile ? 'fixed inset-x-0 bottom-0 z-[100] h-[90vh] rounded-t-xl' : 'h-full w-full'}`}
        >
          <div
            className={`flex items-center ${isMobile ? 'justify-center' : 'justify-between'} overflow-x-auto bg-surface-primary-alt ${activeTab === 'code' ? 'p-3' : 'p-2'}`}
          >
            {!isMobile && (
              <div className="flex items-center">
                <Tabs.List className="relative inline-flex h-9 gap-2 rounded-xl bg-surface-tertiary p-0.5">
                  <div
                    className={`absolute top-0.5 h-8 rounded-xl bg-surface-primary-alt transition-transform duration-200 ease-out ${
                      activeTab === 'code'
                        ? 'w-[42%] translate-x-0'
                        : 'w-[50%] translate-x-[calc(100%-0.250rem)]'
                    }`}
                  />
                  <Tabs.Trigger
                    value="code"
                    className="relative z-10 flex items-center gap-1.5 rounded-xl border-transparent py-1 pl-2.5 pr-2.5 text-xs font-medium transition-all duration-200 ease-out hover:text-text-primary data-[state=active]:text-text-primary data-[state=inactive]:text-text-secondary"
                  >
                    <Code className="size-3" />
                    <span className="transition-all duration-200 ease-out">
                      {localize('com_ui_code')}
                    </span>
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="preview"
                    disabled={isMutating}
                    className="relative z-10 flex items-center gap-2 rounded-xl border-transparent py-1 pl-2.5 pr-2.5 text-xs font-medium transition-all duration-200 ease-out hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:text-text-primary data-[state=inactive]:text-text-secondary"
                  >
                    <Play className="size-3" />
                    <span className="transition-all duration-200 ease-out">
                      {localize('com_ui_preview')}
                    </span>
                  </Tabs.Trigger>
                </Tabs.List>
              </div>
            )}

            <div className="flex min-w-max items-center gap-3">
              {activeTab === 'preview' && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  aria-label="Refresh"
                >
                  {isRefreshing ? (
                    <Spinner size={16} />
                  ) : (
                    <RefreshCw
                      size={16}
                      className={`transform ${isRefreshing ? 'animate-spin' : ''}`}
                    />
                  )}
                </Button>
              )}
              {activeTab !== 'preview' && isMutating && (
                <RefreshCw size={16} className="mr-2 animate-spin text-text-secondary" />
              )}
              {orderedArtifactIds.length > 1 && (
                <ArtifactVersion
                  currentIndex={currentIndex}
                  totalVersions={orderedArtifactIds.length}
                  onVersionChange={(index) => {
                    const target = orderedArtifactIds[index];
                    if (target) setCurrentArtifactId(target);
                  }}
                />
              )}
              <CopyCodeButton content={currentArtifact.content ?? ''} />
              <DownloadArtifact artifact={currentArtifact} />
              <Button
                size="icon"
                variant="ghost"
                onClick={closeArtifacts}
                disabled={isRefreshing}
                aria-label="Close Artifacts"
              >
                <X size={16} />
              </Button>
            </div>
          </div>

          <div className={isMobile ? 'flex-grow overflow-auto' : ''}>
            <ArtifactTabs
              isMermaid={isMermaid}
              artifact={currentArtifact}
              isSubmitting={isSubmitting}
              editorRef={editorRef as React.MutableRefObject<CodeEditorRef>}
              previewRef={previewRef as React.MutableRefObject<SandpackPreviewRef>}
            />
          </div>

          {isMobile && (
            <div className="flex w-full items-center justify-center bg-surface-primary-alt px-3 pb-2 pt-2">
              <Tabs.List className="relative flex h-9 w-full rounded-xl bg-surface-tertiary px-1 py-0.5">
                {/* sliding background: exactly half-width, moves 0% or 100% */}
                <div
                  className={`absolute left-0 top-0.5 h-8 w-1/2 rounded-xl bg-surface-primary-alt transition-transform duration-200 ease-out ${activeTab === 'code' ? 'translate-x-0' : 'translate-x-full'} `}
                />

                <Tabs.Trigger
                  value="code"
                  className="relative z-10 flex w-1/2 items-center justify-center rounded-xl border-transparent py-1 text-center text-xs font-medium transition-all duration-200 ease-out hover:text-text-primary data-[state=active]:text-text-primary data-[state=inactive]:text-text-secondary"
                >
                  <div className="flex items-center gap-1.5">
                    <Code className="size-3" />
                    <span className="transition-all duration-200 ease-out">
                      {localize('com_ui_code')}
                    </span>
                  </div>
                </Tabs.Trigger>

                <Tabs.Trigger
                  value="preview"
                  disabled={isMutating}
                  className="relative z-10 flex w-1/2 items-center justify-center rounded-xl border-transparent py-1 text-center text-xs font-medium transition-all duration-200 ease-out hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:text-text-primary data-[state=inactive]:text-text-secondary"
                >
                  <div className="flex items-center gap-1.5">
                    <Play className="size-3" />
                    <span className="transition-all duration-200 ease-out">
                      {localize('com_ui_preview')}
                    </span>
                  </div>
                </Tabs.Trigger>
              </Tabs.List>
            </div>
          )}
        </div>
      </div>
    </Tabs.Root>
  );
}
