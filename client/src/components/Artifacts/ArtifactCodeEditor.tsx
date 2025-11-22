import React, { useMemo, useState, useEffect, useRef, memo } from 'react';
import debounce from 'lodash/debounce';
import { KeyBinding } from '@codemirror/view';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
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
import { useMutationState, useCodeState } from '~/Providers/EditorContext';
import { useArtifactsContext } from '~/Providers';
import { sharedFiles, sharedOptions } from '~/utils/artifacts';

const CodeEditor = memo(
  ({
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
    const { isMutating, setIsMutating } = useMutationState();
    const { setCurrentCode } = useCodeState();
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

    /**
     * Create stable debounced mutation that doesn't depend on changing callbacks
     * Use refs to always access the latest values without recreating the debounce
     */
    const artifactRef = useRef(artifact);
    const isMutatingRef = useRef(isMutating);
    const currentUpdateRef = useRef(currentUpdate);
    const editArtifactRef = useRef(editArtifact);
    const setCurrentCodeRef = useRef(setCurrentCode);

    useEffect(() => {
      artifactRef.current = artifact;
    }, [artifact]);

    useEffect(() => {
      isMutatingRef.current = isMutating;
    }, [isMutating]);

    useEffect(() => {
      currentUpdateRef.current = currentUpdate;
    }, [currentUpdate]);

    useEffect(() => {
      editArtifactRef.current = editArtifact;
    }, [editArtifact]);

    useEffect(() => {
      setCurrentCodeRef.current = setCurrentCode;
    }, [setCurrentCode]);

    /**
     * Create debounced mutation once - never recreate it
     * All values are accessed via refs so they're always current
     */
    const debouncedMutation = useMemo(
      () =>
        debounce((code: string) => {
          if (readOnly) {
            return;
          }
          if (isMutatingRef.current) {
            return;
          }
          if (artifactRef.current.index == null) {
            return;
          }

          const artifact = artifactRef.current;
          const artifactIndex = artifact.index;
          const isNotOriginal =
            code && artifact.content != null && code.trim() !== artifact.content.trim();
          const isNotRepeated =
            currentUpdateRef.current == null
              ? true
              : code != null && code.trim() !== currentUpdateRef.current.trim();

          if (artifact.content && isNotOriginal && isNotRepeated && artifactIndex != null) {
            setCurrentCodeRef.current(code);
            editArtifactRef.current.mutate({
              index: artifactIndex,
              messageId: artifact.messageId ?? '',
              original: artifact.content,
              updated: code,
            });
          }
        }, 500),
      [readOnly],
    );

    /**
     * Listen to Sandpack file changes and trigger debounced mutation
     */
    useEffect(() => {
      const currentCode = (sandpack.files['/' + fileKey] as SandpackBundlerFile | undefined)?.code;
      if (currentCode) {
        debouncedMutation(currentCode);
      }
    }, [sandpack.files, fileKey, debouncedMutation]);

    /**
     * Cleanup: cancel pending mutations when component unmounts or artifact changes
     */
    useEffect(() => {
      return () => {
        debouncedMutation.cancel();
      };
    }, [artifact.id, debouncedMutation]);

    return (
      <SandpackCodeEditor
        ref={editorRef}
        showTabs={false}
        showRunButton={false}
        showLineNumbers={true}
        showInlineErrors={true}
        readOnly={readOnly === true}
        extensions={[autocompletion()]}
        extensionsKeymap={Array.from<KeyBinding>(completionKeymap)}
        className="hljs language-javascript bg-black"
      />
    );
  },
);

export const ArtifactCodeEditor = function ({
  files,
  fileKey,
  template,
  artifact,
  editorRef,
  sharedProps,
  readOnly: externalReadOnly,
}: {
  fileKey: string;
  artifact: Artifact;
  files: ArtifactFiles;
  template: SandpackProviderProps['template'];
  sharedProps: Partial<SandpackProviderProps>;
  editorRef: React.MutableRefObject<CodeEditorRef>;
  readOnly?: boolean;
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
  const initialReadOnly = (externalReadOnly ?? false) || (isSubmitting ?? false);
  const [readOnly, setReadOnly] = useState(initialReadOnly);
  useEffect(() => {
    setReadOnly((externalReadOnly ?? false) || (isSubmitting ?? false));
  }, [isSubmitting, externalReadOnly]);

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
