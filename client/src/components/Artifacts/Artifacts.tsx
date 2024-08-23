import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import * as Tabs from '@radix-ui/react-tabs';
import { Sandpack } from '@codesandbox/sandpack-react';
import { removeNullishValues } from 'librechat-data-provider';
import { SandpackPreview, SandpackProvider } from '@codesandbox/sandpack-react/unstyled';
import type { Artifact } from '~/common';
import {
  sharedFiles,
  sharedProps,
  sharedOptions,
  getFileExtension,
  getArtifactFilename,
} from '~/utils/artifacts';
import { CodeMarkdown, CopyCodeButton } from './Code';
import { useChatContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';

export function ArtifactPreview({
  showEditor = false,
  artifact,
}: {
  showEditor?: boolean;
  artifact: Artifact;
}) {
  const files = useMemo(() => {
    return removeNullishValues({ [getArtifactFilename(artifact.type ?? '')]: artifact.content });
  }, [artifact.type, artifact.content]);

  if (Object.keys(files).length === 0) {
    return null;
  }

  return showEditor ? (
    <Sandpack
      options={{
        showNavigator: true,
        editorHeight: '80vh',
        showTabs: true,
        ...sharedOptions,
      }}
      files={{
        ...files,
        ...sharedFiles,
      }}
      {...sharedProps}
    />
  ) : (
    <SandpackProvider
      files={{
        ...files,
        ...sharedFiles,
      }}
      options={{ ...sharedOptions }}
      {...sharedProps}
    >
      <SandpackPreview showOpenInCodeSandbox={false} showRefreshButton={false} />
    </SandpackProvider>
  );
}

export default function Artifacts() {
  const { isSubmitting, latestMessage } = useChatContext();

  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('code');
  const artifacts = useRecoilValue(store.artifactsState);

  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(null);
  const [orderedArtifactIds, setOrderedArtifactIds] = useState<string[]>([]);
  const prevArtifactsRef = useRef({});
  const lastRunMessageIdRef = useRef<string | null>(null);
  const lastContentRef = useRef<string | null>(null);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  useEffect(() => {
    if (latestMessage?.messageId !== lastRunMessageIdRef.current) {
      const currentArtifact = currentArtifactId != null ? artifacts[currentArtifactId] : null;
      const currentContent = currentArtifact?.content ?? null;

      if (
        isSubmitting &&
        currentArtifactId != null &&
        activeTab !== 'code' &&
        currentContent !== lastContentRef.current
      ) {
        setActiveTab('code');
        lastContentRef.current = currentContent;
      } else if (!isSubmitting && currentArtifactId == null && orderedArtifactIds.length > 0) {
        setCurrentArtifactId(orderedArtifactIds[0]);
      }

      lastRunMessageIdRef.current = latestMessage?.messageId ?? null;
    }
  }, [activeTab, currentArtifactId, isSubmitting, latestMessage, orderedArtifactIds, artifacts]);

  useEffect(() => {
    const artifactIds = Object.keys(artifacts);
    const newArtifacts = artifactIds.filter((id) => !orderedArtifactIds.includes(id));

    if (newArtifacts.length > 0) {
      setOrderedArtifactIds((prevIds) => [...prevIds, ...newArtifacts]);
      setCurrentArtifactId(newArtifacts[newArtifacts.length - 1]);
    } else if (isSubmitting && currentArtifactId != null) {
      // If submitting and content changed, move current artifact to the end
      setOrderedArtifactIds((prevIds) => {
        const newIds = prevIds.filter((id) => id !== currentArtifactId);
        return [...newIds, currentArtifactId];
      });
    }

    prevArtifactsRef.current = artifacts;
  }, [artifacts, isSubmitting, currentArtifactId, orderedArtifactIds]);

  const currentArtifact = currentArtifactId != null ? artifacts[currentArtifactId] : null;

  const currentIndex = orderedArtifactIds.indexOf(currentArtifactId ?? '');
  const cycleArtifact = (direction: 'next' | 'prev') => {
    let newIndex: number;
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % orderedArtifactIds.length;
    } else {
      newIndex = (currentIndex - 1 + orderedArtifactIds.length) % orderedArtifactIds.length;
    }
    setCurrentArtifactId(orderedArtifactIds[newIndex]);
  };

  if (!currentArtifact) {
    return <div>No artifacts available.</div>;
  }

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab} asChild>
      {/* Main Parent */}
      <div className="flex h-full w-full items-center justify-center py-2">
        {/* Main Container */}
        <div
          className={`flex h-[97%] w-[97%] flex-col overflow-hidden rounded-xl border border-border-medium bg-surface-primary text-xl text-text-primary shadow-xl transition-all duration-300 ease-in-out ${
            isVisible
              ? 'translate-x-0 scale-100 opacity-100'
              : 'translate-x-full scale-95 opacity-0'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-medium bg-surface-primary-alt p-2">
            <div className="flex items-center">
              <button className="mr-2 text-text-secondary" onClick={() => cycleArtifact('prev')}>
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
              <button className="text-text-secondary">
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
            className={cn(
              'flex-grow overflow-auto bg-gray-900',
              isSubmitting ? 'submitting' : '',
              isSubmitting && (currentArtifact.content?.length ?? 0) > 0 ? 'result-streaming' : '',
            )}
          >
            <CodeMarkdown
              showCursor={isSubmitting}
              content={`\`\`\`${getFileExtension(currentArtifact.type)}\n${
                currentArtifact.content ?? ''
              }\`\`\``}
            />
          </Tabs.Content>
          <Tabs.Content value="preview" className="flex-grow overflow-auto bg-surface-secondary">
            <ArtifactPreview artifact={currentArtifact} />
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
