import React, { useMemo, useState } from 'react';
import { useRecoilValue } from 'recoil';
import * as Tabs from '@radix-ui/react-tabs';
import { Sandpack } from '@codesandbox/sandpack-react';
import { SandpackPreview, SandpackProvider } from '@codesandbox/sandpack-react/unstyled';
import { mapCodeFiles, sharedOptions, sharedFiles, sharedProps } from '~/utils/artifacts';
import store from '~/store';

export function CodeViewer({ showEditor = false }: { showEditor?: boolean }) {
  const artifactIds = useRecoilValue(store.artifactIdsState);
  const artifacts = useRecoilValue(store.artifactsState);

  // const files = useMemo(() => mapCodeFiles(artifactIds, artifacts), [artifactIds, artifacts]);

  // console.log('CODE FILES & blocks', files, artifacts);
  const files = {};
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
      className="flex h-full w-full justify-center"
      options={{ ...sharedOptions }}
      {...sharedProps}
    >
      <SandpackPreview
        className="flex h-full w-full justify-center"
        showOpenInCodeSandbox={false}
        showRefreshButton={false}
      />
    </SandpackProvider>
  );
}

export default function Artifacts() {
  const [activeTab, setActiveTab] = useState('code');
  const artifactIds = useRecoilValue(store.artifactIdsState);
  const artifacts = useRecoilValue(store.artifactsState);

  // const files = useMemo(() => mapCodeFiles(artifactIds, artifacts), [artifactIds, artifacts]);
  // const firstFileContent = Object.values(files)[0] || '';

  const firstFileContent = '';

  return (
    <div className="flex h-full w-full flex-col rounded-xl py-2 text-xl text-text-primary">
      <div className="flex h-full flex-col overflow-hidden rounded-lg bg-gray-800 shadow-lg">
        <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
          <Tabs.List className="flex bg-gray-700">
            <Tabs.Trigger
              value="code"
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white focus:text-white focus:outline-none"
            >
              Code
            </Tabs.Trigger>
            <Tabs.Trigger
              value="preview"
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white focus:text-white focus:outline-none"
            >
              Preview
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="code" className="flex-grow overflow-auto">
            <pre className="h-full overflow-auto rounded bg-gray-900 p-4 text-sm">
              <code>{firstFileContent}</code>
            </pre>
          </Tabs.Content>
          <Tabs.Content value="preview" asChild>
            <CodeViewer />
          </Tabs.Content>
        </Tabs.Root>
      </div>
    </div>
  );
}
