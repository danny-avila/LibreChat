import React, { memo, useEffect } from 'react';
import {
  useSandpack,
  SandpackCodeEditor,
  SandpackProvider as StyledProvider,
} from '@codesandbox/sandpack-react';
import { SandpackProviderProps } from '@codesandbox/sandpack-react/unstyled';
import type { CodeEditorRef } from '@codesandbox/sandpack-react';
import type { ArtifactFiles } from '~/common';
import { sharedFiles, sharedOptions } from '~/utils/artifacts';

const CodeEditor = ({
  fileKey,
  editorRef,
}: {
  fileKey: string;
  editorRef: React.MutableRefObject<CodeEditorRef>;
}) => {
  const { sandpack } = useSandpack();
  useEffect(() => {
    console.log(sandpack.files['/' + fileKey]);
  }, [sandpack.files, fileKey]);
  return (
    <SandpackCodeEditor
      ref={editorRef}
      showTabs={false}
      showRunButton={false}
      className="hljs language-javascript bg-black"
    />
  );
};

export const ArtifactCodeEditor = memo(function ({
  files,
  fileKey,
  template,
  editorRef,
  sharedProps,
}: {
  files: ArtifactFiles;
  fileKey: string;
  template: SandpackProviderProps['template'];
  sharedProps: Partial<SandpackProviderProps>;
  editorRef: React.MutableRefObject<CodeEditorRef>;
}) {
  if (Object.keys(files).length === 0) {
    return null;
  }

  return (
    <StyledProvider
      theme="dark"
      files={{
        ...files,
        ...sharedFiles,
      }}
      options={{ ...sharedOptions }}
      {...sharedProps}
      template={template}
    >
      <CodeEditor editorRef={editorRef} fileKey={fileKey} />
    </StyledProvider>
  );
});
