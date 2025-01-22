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
  readOnly,
  editorRef,
}: {
  fileKey: string;
  readOnly: boolean;
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
      readOnly={readOnly}
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
  isSubmitting,
}: {
  fileKey: string;
  files: ArtifactFiles;
  isSubmitting: boolean;
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
      <CodeEditor editorRef={editorRef} fileKey={fileKey} readOnly={isSubmitting} />
    </StyledProvider>
  );
});
