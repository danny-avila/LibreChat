import { useRef, useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useSetRecoilState } from 'recoil';
import * as Tabs from '@radix-ui/react-tabs';
import { SandpackPreviewRef } from '@codesandbox/sandpack-react';
import useArtifacts from '~/hooks/Artifacts/useArtifacts';
import { CodeMarkdown, CopyCodeButton } from './Code';
import { getFileExtension } from '~/utils/artifacts';
import { ArtifactPreview } from './ArtifactPreview';
import { cn } from '~/utils';
import store from '~/store';

export default function Artifacts() {
  const previewRef = useRef<SandpackPreviewRef>();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const setArtifactsVisible = useSetRecoilState(store.artifactsVisible);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const {
    activeTab,
    isMermaid,
    isSubmitting,
    setActiveTab,
    currentIndex,
    cycleArtifact,
    currentArtifact,
    orderedArtifactIds,
  } = useArtifacts();

  if (currentArtifact === null || currentArtifact === undefined) {
    return null;
  }

  const handleRefresh = () => {
    setIsRefreshing(true);
    const client = previewRef.current?.getClient();
    if (client != null) {
      client.dispatch({ type: 'refresh' });
    }
    setTimeout(() => setIsRefreshing(false), 750);
  };

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab} asChild>
      {/* Main Parent */}
      <div className="flex h-full w-full items-center justify-center">
        {/* Main Container */}
        <div
          className={`flex h-full w-full flex-col overflow-hidden border border-border-medium bg-surface-primary text-xl text-text-primary shadow-xl transition-all duration-300 ease-in-out ${
            isVisible
              ? 'translate-x-0 scale-100 opacity-100'
              : 'translate-x-full scale-95 opacity-0'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-medium bg-surface-primary-alt p-2">
            <div className="flex items-center">
              <button
                className="mr-2 text-text-secondary"
                onClick={() => {
                  setIsVisible(false);
                  setTimeout(() => setArtifactsVisible(false), 300);
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  viewBox="0 0 256 256"
                >
                  <path d="M224,128a8,8,0,0,1-8,8H59.31l58.35,58.34a8,8,0,0,1-11.32,11.32l-72-72a8,8,0,0,1,0-11.32l72-72a8,8,0,0,1,11.32,11.32L59.31,120H216A8,8,0,0,1,224,128Z" />
                </svg>
              </button>
              <h3 className="truncate text-sm text-text-primary">{currentArtifact.title}</h3>
            </div>
            <div className="flex items-center">
              {/* Refresh button */}
              {activeTab === 'preview' && (
                <button
                  className={`mr-2 text-text-secondary transition-transform duration-500 ease-in-out ${
                    isRefreshing ? 'rotate-180' : ''
                  }`}
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  aria-label="Refresh"
                >
                  <RefreshCw
                    size={16}
                    className={`transform ${isRefreshing ? 'animate-spin' : ''}`}
                  />
                </button>
              )}
              <Tabs.List className="mr-2 inline-flex h-7 rounded-full border border-border-medium bg-surface-tertiary">
                <Tabs.Trigger
                  value="preview"
                  className="border-0.5 flex items-center gap-1 rounded-full border-transparent py-1 pl-2.5 pr-2.5 text-xs font-medium text-text-secondary data-[state=active]:border-border-light data-[state=active]:bg-surface-primary-alt data-[state=active]:text-text-primary"
                >
                  Preview
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="code"
                  className="border-0.5 flex items-center gap-1 rounded-full border-transparent py-1 pl-2.5 pr-2.5 text-xs font-medium text-text-secondary data-[state=active]:border-border-light data-[state=active]:bg-surface-primary-alt data-[state=active]:text-text-primary"
                >
                  Code
                </Tabs.Trigger>
              </Tabs.List>
              <button
                className="text-text-secondary"
                onClick={() => {
                  setIsVisible(false);
                  setTimeout(() => setArtifactsVisible(false), 300);
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  viewBox="0 0 256 256"
                >
                  <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
                </svg>
              </button>
            </div>
          </div>
          {/* Content */}
          <Tabs.Content
            value="code"
            className={cn('flex-grow overflow-x-auto overflow-y-scroll bg-gray-900 p-4')}
          >
            <CodeMarkdown
              content={`\`\`\`${getFileExtension(currentArtifact.type)}\n${
                currentArtifact.content ?? ''
              }\`\`\``}
              isSubmitting={isSubmitting}
            />
          </Tabs.Content>
          <Tabs.Content
            value="preview"
            className={cn('flex-grow overflow-auto', isMermaid ? 'bg-[#282C34]' : 'bg-white')}
          >
            <ArtifactPreview
              artifact={currentArtifact}
              previewRef={previewRef as React.MutableRefObject<SandpackPreviewRef>}
            />
          </Tabs.Content>
          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border-medium bg-surface-primary-alt p-2 text-sm text-text-secondary">
            <div className="flex items-center">
              <button onClick={() => cycleArtifact('prev')} className="mr-2 text-text-secondary">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  viewBox="0 0 256 256"
                >
                  <path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z" />
                </svg>
              </button>
              <span className="text-xs">{`${currentIndex + 1} / ${
                orderedArtifactIds.length
              }`}</span>
              <button onClick={() => cycleArtifact('next')} className="ml-2 text-text-secondary">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  viewBox="0 0 256 256"
                >
                  <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z" />
                </svg>
              </button>
            </div>
            <div className="flex items-center">
              <CopyCodeButton content={currentArtifact.content ?? ''} />
              {/* Download Button */}
              {/* <button className="mr-2 text-text-secondary">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  viewBox="0 0 256 256"
                >
                  <path d="M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z" />
                </svg>
              </button> */}
              {/* Publish button */}
              {/* <button className="border-0.5 min-w-[4rem] whitespace-nowrap rounded-md border-border-medium bg-[radial-gradient(ellipse,_var(--tw-gradient-stops))] from-surface-active from-50% to-surface-active px-3 py-1 text-xs font-medium text-text-primary transition-colors hover:bg-surface-active hover:text-text-primary active:scale-[0.985] active:bg-surface-active">
                Publish
              </button> */}
            </div>
          </div>
        </div>
      </div>
    </Tabs.Root>
  );
}
