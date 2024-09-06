import React, { useRef, useState, useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { RefreshCw } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import { SandpackPreviewRef } from '@codesandbox/sandpack-react';
import { artifactsState } from '~/store/artifacts';
import { CodeMarkdown, CopyCodeButton } from '../Artifacts/Code';
import { getFileExtension } from '~/utils/artifacts';
import { ArtifactPreview } from '../Artifacts/ArtifactPreview';
import { cn } from '~/utils';
import store from '~/store';

interface SharedArtifactsProps {
  isOpen: boolean;
  onClose: () => void;
}

const SharedArtifacts: React.FC<SharedArtifactsProps> = ({ isOpen, onClose }) => {
  const artifacts = useRecoilValue(artifactsState);
  const currentArtifactId = useRecoilValue(store.currentArtifactId);
  const setCurrentArtifactId = useSetRecoilState(store.currentArtifactId);
  const previewRef = useRef<SandpackPreviewRef>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('preview');

  const orderedArtifactIds = artifacts ? Object.keys(artifacts) : [];
  const currentArtifact = artifacts && currentArtifactId ? artifacts[currentArtifactId] : null;
  const currentIndex = orderedArtifactIds.indexOf(currentArtifactId ?? '');

  useEffect(() => {
    if (isOpen && orderedArtifactIds.length > 0 && !currentArtifactId) {
      // If no artifact is selected, select the first one
      setCurrentArtifactId(orderedArtifactIds[0]);
    }
  }, [isOpen, orderedArtifactIds, currentArtifactId, setCurrentArtifactId]);

  if (!artifacts || Object.keys(artifacts).length === 0) {
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

  const cycleArtifact = (direction: 'prev' | 'next') => {
    let newIndex;
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : orderedArtifactIds.length - 1;
    } else {
      newIndex = currentIndex < orderedArtifactIds.length - 1 ? currentIndex + 1 : 0;
    }
    setCurrentArtifactId(orderedArtifactIds[newIndex]);
  };

  const isMermaid = currentArtifact?.type === 'mermaid';

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab} asChild>
      <div
        className={cn(
          'fixed right-0 top-0 z-50 h-full w-96 overflow-hidden bg-surface-secondary shadow-lg transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-medium bg-surface-primary-alt p-2">
            <div className="flex items-center">
              <h3 className="truncate text-sm text-text-primary">{currentArtifact?.title}</h3>
            </div>
            <div className="flex items-center">
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
              <button className="text-text-secondary" onClick={onClose}>
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
            {currentArtifact && (
              <CodeMarkdown
                content={`\`\`\`${getFileExtension(currentArtifact.type)}\n${
                  currentArtifact.content ?? ''
                }\`\`\``}
                isSubmitting={false}
              />
            )}
          </Tabs.Content>
          <Tabs.Content
            value="preview"
            className={cn('flex-grow overflow-auto', isMermaid ? 'bg-[#282C34]' : 'bg-white')}
          >
            {currentArtifact && (
              <ArtifactPreview
                artifact={currentArtifact}
                previewRef={previewRef as React.MutableRefObject<SandpackPreviewRef>}
              />
            )}
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
              <span className="text-xs">{`${currentIndex + 1} / ${orderedArtifactIds.length}`}</span>
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
              {currentArtifact && <CopyCodeButton content={currentArtifact.content ?? ''} />}
            </div>
          </div>
        </div>
      </div>
    </Tabs.Root>
  );
};

export default SharedArtifacts;