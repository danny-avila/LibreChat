import React, { useMemo, useState, useEffect, useRef, memo, useCallback } from 'react';
import MonacoEditor from '@monaco-editor/react';
import debounce from 'lodash/debounce';
import type { editor } from 'monaco-editor';
import type { Artifact } from '~/common';
import { useEditArtifact } from '~/data-provider';
import { useMutationState, useCodeState } from '~/Providers/EditorContext';
import { useArtifactsContext } from '~/Providers';

/** Map artifact type/language to Monaco language identifier */
function getMonacoLanguage(type?: string, language?: string): string {
  if (language) {
    const langMap: Record<string, string> = {
      javascript: 'javascript',
      typescript: 'typescript',
      python: 'python',
      css: 'css',
      json: 'json',
      markdown: 'markdown',
      html: 'html',
      xml: 'xml',
      sql: 'sql',
      yaml: 'yaml',
      shell: 'shell',
      bash: 'shell',
      tsx: 'typescript',
      jsx: 'javascript',
    };
    if (langMap[language]) {
      return langMap[language];
    }
  }

  const typeMap: Record<string, string> = {
    'text/html': 'html',
    'application/vnd.code-html': 'html',
    'application/vnd.react': 'typescript',
    'text/markdown': 'markdown',
    'text/md': 'markdown',
    'text/plain': 'plaintext',
    'application/vnd.mermaid': 'markdown',
  };

  return typeMap[type ?? ''] ?? 'html';
}

const CodeEditor = memo(function CodeEditor({
  content,
  readOnly,
  artifact,
  monacoRef,
  onContentChange,
}: {
  content: string;
  readOnly: boolean;
  artifact: Artifact;
  monacoRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>;
  onContentChange: (code: string) => void;
}) {
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

  const artifactRef = useRef(artifact);
  const isMutatingRef = useRef(isMutating);
  const currentUpdateRef = useRef(currentUpdate);
  const editArtifactRef = useRef(editArtifact);
  const setCurrentCodeRef = useRef(setCurrentCode);

  artifactRef.current = artifact;
  isMutatingRef.current = isMutating;
  currentUpdateRef.current = currentUpdate;
  editArtifactRef.current = editArtifact;
  setCurrentCodeRef.current = setCurrentCode;

  const debouncedMutation = useMemo(
    () =>
      debounce((code: string) => {
        if (readOnly || isMutatingRef.current || artifactRef.current.index == null) {
          return;
        }

        const art = artifactRef.current;
        const isNotOriginal = code && art.content != null && code.trim() !== art.content.trim();
        const isNotRepeated =
          currentUpdateRef.current == null
            ? true
            : code != null && code.trim() !== currentUpdateRef.current.trim();

        if (art.content && isNotOriginal && isNotRepeated && art.index != null) {
          setCurrentCodeRef.current(code);
          editArtifactRef.current.mutate({
            index: art.index,
            messageId: art.messageId ?? '',
            original: art.content,
            updated: code,
          });
        }
      }, 500),
    [readOnly],
  );

  useEffect(() => {
    return () => {
      debouncedMutation.cancel();
    };
  }, [artifact.id, debouncedMutation]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (!value || readOnly) {
        return;
      }
      onContentChange(value);
      debouncedMutation(value);
    },
    [readOnly, debouncedMutation, onContentChange],
  );

  const handleMount = useCallback(
    (editor: editor.IStandaloneCodeEditor) => {
      monacoRef.current = editor;
    },
    [monacoRef],
  );

  const language = getMonacoLanguage(artifact.type, artifact.language);

  return (
    <MonacoEditor
      height="100%"
      language={language}
      theme="vs-dark"
      value={content}
      onChange={handleChange}
      onMount={handleMount}
      options={{
        readOnly,
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        fontSize: 13,
        tabSize: 2,
        wordWrap: 'on',
        automaticLayout: true,
        padding: { top: 8 },
        renderLineHighlight: readOnly ? 'none' : 'line',
        cursorStyle: readOnly ? 'underline-thin' : 'line',
      }}
    />
  );
});

export const ArtifactCodeEditor = function ArtifactCodeEditor({
  artifact,
  monacoRef,
  readOnly: externalReadOnly,
}: {
  artifact: Artifact;
  monacoRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>;
  readOnly?: boolean;
}) {
  const { isSubmitting } = useArtifactsContext();
  const readOnly = (externalReadOnly ?? false) || isSubmitting;
  const { setCurrentCode } = useCodeState();

  const [editorContent, setEditorContent] = useState(artifact.content ?? '');
  const prevArtifactId = useRef(artifact.id);

  /** Reset editor content when switching artifacts */
  if (artifact.id !== prevArtifactId.current) {
    setEditorContent(artifact.content ?? '');
    prevArtifactId.current = artifact.id;
  }

  /** Sync streaming content into editor during generation */
  useEffect(() => {
    if (!readOnly || !artifact.content) {
      return;
    }
    setEditorContent(artifact.content);
  }, [artifact.content, readOnly]);

  /** When streaming ends, sync final content */
  const prevReadOnly = useRef(readOnly);
  useEffect(() => {
    if (prevReadOnly.current && !readOnly && artifact.content) {
      setEditorContent(artifact.content);
    }
    prevReadOnly.current = readOnly;
  }, [readOnly, artifact.content]);

  const onContentChange = useCallback(
    (code: string) => {
      setEditorContent(code);
      setCurrentCode(code);
    },
    [setCurrentCode],
  );

  if (!artifact.content) {
    return null;
  }

  return (
    <div className="h-full w-full bg-[#1e1e1e]">
      <CodeEditor
        content={editorContent}
        readOnly={readOnly}
        artifact={artifact}
        monacoRef={monacoRef}
        onContentChange={onContentChange}
      />
    </div>
  );
};
