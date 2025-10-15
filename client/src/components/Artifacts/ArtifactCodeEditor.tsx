import debounce from 'lodash/debounce';
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  useSandpack,
  SandpackCodeEditor,
  SandpackProvider as StyledProvider,
} from '@codesandbox/sandpack-react';
import type { SandpackProviderProps } from '@codesandbox/sandpack-react/unstyled';
import type { SandpackBundlerFile } from '@codesandbox/sandpack-client';
import type { CodeEditorRef } from '@codesandbox/sandpack-react';
import type { ArtifactFiles, Artifact } from '~/common';
import { useEditArtifact, useGetStartupConfig } from '~/data-provider';
import { useEditorContext, useArtifactsContext } from '~/Providers';
import { sharedFiles, sharedOptions } from '~/utils/artifacts';

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
  readOnly?: boolean;
  artifact: Artifact;
  editorRef: React.MutableRefObject<CodeEditorRef>;
}) => {
  const { sandpack } = useSandpack();
  const [currentUpdate, setCurrentUpdate] = useState<string | null>(null);
  const { isMutating, setIsMutating, setCurrentCode } = useEditorContext();
  const editArtifact = useEditArtifact({
    onMutate: (vars) => {
      setIsMutating(true);
      setCurrentUpdate(vars.updated);
    },
    onSuccess: () => {
      setIsMutating(false);
      setCurrentUpdate(null);
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
    if (artifact.index == null) {
      return;
    }

    const currentCode = (sandpack.files['/' + fileKey] as SandpackBundlerFile | undefined)?.code;
    const isNotOriginal =
      currentCode && artifact.content != null && currentCode.trim() !== artifact.content.trim();
    const isNotRepeated =
      currentUpdate == null
        ? true
        : currentCode != null && currentCode.trim() !== currentUpdate.trim();

    if (artifact.content && isNotOriginal && isNotRepeated) {
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
    currentUpdate,
    setIsMutating,
    sandpack.files,
    setCurrentCode,
    debouncedMutation,
  ]);

  return (
    <SandpackCodeEditor
      ref={editorRef}
      showTabs={false}
      showRunButton={false}
      showLineNumbers={true}
      showInlineErrors={true}
      readOnly={readOnly === true}
      className="hljs language-javascript bg-black"
    />
  );
};

export const ArtifactCodeEditor = function ({
  files,
  fileKey,
  template,
  artifact,
  editorRef,
  sharedProps,
}: {
  fileKey: string;
  artifact: Artifact;
  files: ArtifactFiles;
  template: SandpackProviderProps['template'];
  sharedProps: Partial<SandpackProviderProps>;
  editorRef: React.MutableRefObject<CodeEditorRef>;
}) {
  const { data: config } = useGetStartupConfig();
  const { isSubmitting } = useArtifactsContext();
  const options: typeof sharedOptions = useMemo(() => {
    if (!config) {
      return sharedOptions;
    }
    return {
      ...sharedOptions,
      activeFile: '/' + fileKey,
      bundlerURL: template === 'static' ? config.staticBundlerURL : config.bundlerURL,
    };
  }, [config, template, fileKey]);
  const [readOnly, setReadOnly] = useState(isSubmitting ?? false);
  useEffect(() => {
    setReadOnly(isSubmitting ?? false);
  }, [isSubmitting]);

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
      options={options}
      {...sharedProps}
      template={template}
    >
      <CodeEditor fileKey={fileKey} artifact={artifact} editorRef={editorRef} readOnly={readOnly} />
    </StyledProvider>
  );
};
