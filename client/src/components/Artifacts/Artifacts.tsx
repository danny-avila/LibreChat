import React, { useMemo, useState } from 'react';
import { useRecoilValue } from 'recoil';
import * as Tabs from '@radix-ui/react-tabs';
import { Sandpack } from '@codesandbox/sandpack-react';
import {
  SandpackPreview,
  SandpackProvider,
} from '@codesandbox/sandpack-react/unstyled';
import { mapCodeFiles, sharedOptions, sharedFiles, sharedProps } from '~/utils/artifacts';
import store from '~/store';

export function CodeViewer({ showEditor = false }: { showEditor?: boolean }) {
  const codeBlockIds = useRecoilValue(store.codeBlockIdsState);
  const codeBlocks = useRecoilValue(store.codeBlocksState);

  const files = useMemo(() => mapCodeFiles(codeBlockIds, codeBlocks), [codeBlockIds, codeBlocks]);

  console.log('CODE FILES & blocks', files, codeBlocks);
  if ((Object.keys(files)).length === 0) {
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
  const codeBlockIds = useRecoilValue(store.codeBlockIdsState);
  const codeBlocks = useRecoilValue(store.codeBlocksState);

  const files = useMemo(() => mapCodeFiles(codeBlockIds, codeBlocks), [codeBlockIds, codeBlocks]);
  const firstFileContent = Object.values(files)[0] || '';

  return (
    <div className="flex h-full flex-col text-text-primary text-xl w-full rounded-xl py-2">
      <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden flex flex-col h-full">
        <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
          <Tabs.List className="flex bg-gray-700">
            <Tabs.Trigger
              value="code"
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white focus:outline-none focus:text-white"
            >
              Code
            </Tabs.Trigger>
            <Tabs.Trigger
              value="preview"
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white focus:outline-none focus:text-white"
            >
              Preview
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="code" className="flex-grow overflow-auto">
            <pre className="h-full bg-gray-900 p-4 rounded text-sm overflow-auto">
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
