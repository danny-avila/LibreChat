import { useRef, useState, useEffect } from 'react';
import { useSetRecoilState } from 'recoil';
import * as Tabs from '@radix-ui/react-tabs';
import { Code, Play, RefreshCw, X } from 'lucide-react';
import { Button, Spinner, useMediaQuery } from '@librechat/client';
import type { SandpackPreviewRef, CodeEditorRef } from '@codesandbox/sandpack-react';
import useArtifacts from '~/hooks/Artifacts/useArtifacts';
import DownloadArtifact from './DownloadArtifact';
import ArtifactVersion from './ArtifactVersion';
import { useEditorContext } from '~/Providers';
import ArtifactTabs from './ArtifactTabs';
import { CopyCodeButton } from './Code';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

export default function Artifacts() {
  const localize = useLocalize();
  const { isMutating } = useEditorContext();
  const isMobile = useMediaQuery('(max-width: 868px)');
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
    setActiveTab,
    currentIndex,
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
    setTimeout(() => setArtifactsVisible(false), isMobile ? 400 : 500);
  };

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab} asChild>
      <div className="flex h-full w-full flex-col">
        {/* Mobile backdrop */}
        {isMobile && (
          <div
            className={cn(
              'duration-400 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] fixed inset-0 z-[99] bg-black/40 backdrop-blur-md transition-opacity',
              isVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            onClick={closeArtifacts}
            aria-hidden="true"
          />
        )}
        <div
          className={cn(
            'flex h-full w-full flex-col overflow-hidden bg-surface-primary text-xl text-text-primary',
            isMobile
              ? cn(
                  'duration-400 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] fixed inset-x-0 bottom-0 z-[100] h-[90vh] rounded-t-[20px] shadow-[0_-10px_40px_rgba(0,0,0,0.3)] transition-transform will-change-transform',
                  isVisible ? 'translate-y-0' : 'translate-y-full',
                )
              : cn(
                  'ease-[cubic-bezier(0.25,0.46,0.45,0.94)] shadow-xl transition-all duration-500 will-change-transform',
                  isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0',
                ),
          )}
        >
          {/* Mobile drag indicator */}
          {isMobile && (
            <div className="flex flex-shrink-0 items-center justify-center pb-1.5 pt-2">
              <div className="h-1 w-10 rounded-full bg-border-medium opacity-50" />
            </div>
          )}
          {/* Header */}
          <div
            className={cn(
              'flex flex-shrink-0 items-center justify-between gap-2 overflow-x-auto border-b border-border-light bg-surface-primary-alt px-3 py-2',
              isMobile && 'justify-center',
            )}
          >
            {!isMobile && (
              <div className="flex items-center">
                <Tabs.List className="relative inline-flex h-9 gap-2 rounded-xl bg-surface-tertiary p-0.5">
                  <div
                    className={cn(
                      'absolute top-0.5 h-8 rounded-xl bg-surface-primary-alt transition-transform duration-200 ease-out',
                      activeTab === 'code'
                        ? 'w-[42%] translate-x-0'
                        : 'w-[50%] translate-x-[calc(100%-0.250rem)]',
                    )}
                  />
                  <Tabs.Trigger
                    value="code"
                    className="relative z-10 flex items-center gap-1.5 rounded-xl border-transparent px-3 py-1 text-xs font-medium transition-all duration-200 ease-out hover:text-text-primary data-[state=active]:text-text-primary data-[state=inactive]:text-text-secondary"
                  >
                    <Code className="size-3" />
                    <span>{localize('com_ui_code')}</span>
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="preview"
                    disabled={isMutating}
                    className="relative z-10 flex items-center gap-1.5 rounded-xl border-transparent px-3 py-1 text-xs font-medium transition-all duration-200 ease-out hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:text-text-primary data-[state=inactive]:text-text-secondary"
                  >
                    <Play className="size-3" />
                    <span>{localize('com_ui_preview')}</span>
                  </Tabs.Trigger>
                </Tabs.List>
              </div>
            )}

            <div className="flex min-w-max items-center gap-2">
              {activeTab === 'preview' && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  aria-label={localize('com_ui_refresh')}
                  className="h-8 w-8 transition-transform duration-150 ease-out hover:scale-105 active:scale-95"
                >
                  {isRefreshing ? <Spinner size={16} /> : <RefreshCw size={16} />}
                </Button>
              )}
              {activeTab !== 'preview' && isMutating && (
                <RefreshCw size={16} className="animate-spin text-text-secondary" />
              )}
              {orderedArtifactIds.length > 1 && (
                <ArtifactVersion
                  currentIndex={currentIndex}
                  totalVersions={orderedArtifactIds.length}
                  onVersionChange={(index) => {
                    const target = orderedArtifactIds[index];
                    if (target) {
                      setCurrentArtifactId(target);
                    }
                  }}
                />
              )}
              <CopyCodeButton content={currentArtifact.content ?? ''} />
              <DownloadArtifact artifact={currentArtifact} />
              <Button
                size="icon"
                variant="ghost"
                onClick={closeArtifacts}
                aria-label={localize('com_ui_close')}
                className="h-8 w-8 transition-transform duration-150 ease-out hover:scale-105 active:scale-95"
              >
                <X size={16} />
              </Button>
            </div>
          </div>

          {/* Content Area - This is the key fix */}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <ArtifactTabs
              artifact={currentArtifact}
              editorRef={editorRef as React.MutableRefObject<CodeEditorRef>}
              previewRef={previewRef as React.MutableRefObject<SandpackPreviewRef>}
            />
          </div>

          {/* Mobile Tab Switcher */}
          {isMobile && (
            <div className="pb-safe-offset-3 flex-shrink-0 border-t border-border-light bg-surface-primary-alt px-3 pt-2">
              <Tabs.List className="relative flex h-10 w-full rounded-xl bg-surface-tertiary p-1">
                <div
                  className={cn(
                    'duration-[250ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)] absolute left-1 top-1 h-8 w-[calc(50%-0.25rem)] rounded-lg bg-surface-primary-alt shadow-sm transition-transform',
                    activeTab === 'code' ? 'translate-x-0' : 'translate-x-[calc(100%+0.5rem)]',
                  )}
                />
                <Tabs.Trigger
                  value="code"
                  className="relative z-10 flex w-1/2 items-center justify-center gap-1.5 rounded-lg border-transparent py-1.5 text-xs font-medium transition-all duration-150 ease-out active:scale-95 data-[state=active]:text-text-primary data-[state=inactive]:text-text-secondary"
                >
                  <Code className="size-3.5" />
                  <span>{localize('com_ui_code')}</span>
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="preview"
                  disabled={isMutating}
                  className="relative z-10 flex w-1/2 items-center justify-center gap-1.5 rounded-lg border-transparent py-1.5 text-xs font-medium transition-all duration-150 ease-out active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:text-text-primary data-[state=inactive]:text-text-secondary"
                >
                  <Play className="size-3.5" />
                  <span>{localize('com_ui_preview')}</span>
                </Tabs.Trigger>
              </Tabs.List>
            </div>
          )}
        </div>
      </div>
    </Tabs.Root>
  );
}
