import React, { memo } from 'react';
import {
  SandpackCodeEditor,
  SandpackProvider as StyledProvider,
} from '@codesandbox/sandpack-react';
import { SandpackProviderProps } from '@codesandbox/sandpack-react/unstyled';
import type { CodeEditorRef } from '@codesandbox/sandpack-react';
import type { ArtifactFiles } from '~/common';
import { sharedFiles, sharedOptions } from '~/utils/artifacts';

export const ArtifactCodeEditor = memo(function ({
  files,
  editorRef,
  sharedProps,
  template,
}: {
  files: ArtifactFiles;
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
      <SandpackCodeEditor
        ref={editorRef}
        showTabs={false}
        showRunButton={false}
        className="hljs language-javascript bg-black"
      />
    </StyledProvider>
  );
});
