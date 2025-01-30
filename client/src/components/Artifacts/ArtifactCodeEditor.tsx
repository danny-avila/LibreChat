import debounce from 'lodash/debounce';
import React, { memo, useEffect, useMemo, useCallback } from 'react';
import {
  useSandpack,
  SandpackCodeEditor,
  SandpackProvider as StyledProvider,
} from '@codesandbox/sandpack-react';
import { SandpackProviderProps } from '@codesandbox/sandpack-react/unstyled';
import type { CodeEditorRef } from '@codesandbox/sandpack-react';
import type { ArtifactFiles, Artifact } from '~/common';
import { sharedFiles, sharedOptions } from '~/utils/artifacts';
import { useEditArtifact } from '~/data-provider';
import { useEditorContext } from '~/Providers';

const createDebouncedMutation = (
  callback: (params: {
    index: number;
    messageId: string;
    original: string;
    updated: string;
  }) => void,
) => debounce(callback, 500);

const CodeEditor = ({
  fileKey,
  readOnly,
  artifact,
  editorRef,
}: {
  fileKey: string;
  readOnly: boolean;
  artifact: Artifact;
  editorRef: React.MutableRefObject<CodeEditorRef>;
}) => {
  const { sandpack } = useSandpack();
  const { isMutating, setIsMutating, setCurrentCode } = useEditorContext();
  const editArtifact = useEditArtifact({
    onMutate: () => {
      setIsMutating(true);
    },
    onSuccess: () => {
      setIsMutating(false);
    },
    onError: () => {
      setIsMutating(false);
    },
  });

  const mutationCallback = useCallback(
    (params: { index: number; messageId: string; original: string; updated: string }) => {
      editArtifact.mutate(params);
    },
    [editArtifact],
  );

  const debouncedMutation = useMemo(
    () => createDebouncedMutation(mutationCallback),
    [mutationCallback],
  );

  useEffect(() => {
    if (readOnly) {
      return;
    }
    if (isMutating) {
      return;
    }

    const currentCode = sandpack.files['/' + fileKey].code;

    if (currentCode && artifact.content != null && currentCode.trim() !== artifact.content.trim()) {
      setCurrentCode(currentCode);
      debouncedMutation({
        index: artifact.index,
        messageId: artifact.messageId ?? '',
        original: artifact.content,
        updated: currentCode,
      });
    }

    return () => {
      debouncedMutation.cancel();
    };
  }, [
    fileKey,
    artifact.index,
    artifact.content,
    artifact.messageId,
    readOnly,
    isMutating,
    sandpack.files,
    setIsMutating,
    setCurrentCode,
    debouncedMutation,
  ]);

  return (
    <SandpackCodeEditor
      ref={editorRef}
      showTabs={false}
      readOnly={readOnly}
      showRunButton={false}
      showLineNumbers={true}
      showInlineErrors={true}
      className="hljs language-javascript bg-black"
    />
  );
};

export const ArtifactCodeEditor = memo(function ({
  files,
  fileKey,
  template,
  artifact,
  editorRef,
  sharedProps,
  isSubmitting,
}: {
  fileKey: string;
  artifact: Artifact;
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
      <CodeEditor
        editorRef={editorRef}
        fileKey={fileKey}
        readOnly={isSubmitting}
        artifact={artifact}
      />
    </StyledProvider>
  );
});
