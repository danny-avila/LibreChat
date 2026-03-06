import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import debounce from 'lodash/debounce';
import MonacoEditor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { Artifact } from '~/common';
import { useMutationState, useCodeState } from '~/Providers/EditorContext';
import { useArtifactsContext } from '~/Providers';
import { useEditArtifact } from '~/data-provider';

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
  const [currentUpdate, setCurrentUpdate] = useState<string | null>(null);
  const { isMutating, setIsMutating } = useMutationState();
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
  const prevContentRef = useRef(artifact.content ?? '');
  const prevArtifactId = useRef(artifact.id);

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
    return () => debouncedMutation.cancel();
  }, [artifact.id, debouncedMutation]);

  /**
   * Streaming: use model.applyEdits() to append new content.
   * Unlike setValue/pushEditOperations, applyEdits preserves existing
   * tokens so syntax highlighting doesn't flash during updates.
   */
  useEffect(() => {
    const ed = monacoRef.current;
    if (!ed || !readOnly) {
      return;
    }
    const newContent = artifact.content ?? '';
    const prev = prevContentRef.current;

    if (newContent === prev) {
      return;
    }

    const model = ed.getModel();
    if (!model) {
      return;
    }

    if (newContent.startsWith(prev) && prev.length > 0) {
      const appended = newContent.slice(prev.length);
      const endPos = model.getPositionAt(model.getValueLength());
      model.applyEdits([
        {
          range: {
            startLineNumber: endPos.lineNumber,
            startColumn: endPos.column,
            endLineNumber: endPos.lineNumber,
            endColumn: endPos.column,
          },
          text: appended,
        },
      ]);
    } else {
      model.setValue(newContent);
    }

    prevContentRef.current = newContent;
    ed.revealLine(model.getLineCount());
  }, [artifact.content, readOnly, monacoRef]);

  /** Reset when switching artifacts */
  useEffect(() => {
    if (artifact.id === prevArtifactId.current) {
      return;
    }
    prevArtifactId.current = artifact.id;
    prevContentRef.current = artifact.content ?? '';
    const ed = monacoRef.current;
    if (ed && artifact.content) {
      ed.getModel()?.setValue(artifact.content);
    }
  }, [artifact.id, artifact.content, monacoRef]);

  /** Sync final content when streaming ends */
  const prevReadOnly = useRef(readOnly);
  useEffect(() => {
    if (prevReadOnly.current && !readOnly && artifact.content) {
      const ed = monacoRef.current;
      if (ed) {
        ed.getModel()?.setValue(artifact.content);
        prevContentRef.current = artifact.content;
      }
    }
    prevReadOnly.current = readOnly;
  }, [readOnly, artifact.content, monacoRef]);

  /** Toggle readOnly and disable expensive features during streaming */
  useEffect(() => {
    monacoRef.current?.updateOptions({
      readOnly,
      renderLineHighlight: readOnly ? 'none' : 'line',
      cursorStyle: readOnly ? 'underline-thin' : 'line',
      colorDecorators: !readOnly,
      occurrencesHighlight: readOnly ? 'off' : 'singleFile',
      selectionHighlight: !readOnly,
      renderValidationDecorations: readOnly ? 'off' : 'editable',
      quickSuggestions: !readOnly,
      suggestOnTriggerCharacters: !readOnly,
      parameterHints: { enabled: !readOnly },
      hover: { enabled: !readOnly },
      matchBrackets: readOnly ? 'never' : 'always',
    });
  }, [readOnly, monacoRef]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (!value || readOnly) {
        return;
      }
      prevContentRef.current = value;
      setCurrentCode(value);
      debouncedMutation(value);
    },
    [readOnly, debouncedMutation, setCurrentCode],
  );

  const handleMount = useCallback(
    (ed: editor.IStandaloneCodeEditor) => {
      monacoRef.current = ed;
      if (readOnly) {
        const model = ed.getModel();
        if (model) {
          ed.revealLine(model.getLineCount());
        }
      }
    },
    [monacoRef, readOnly],
  );

  const language = getMonacoLanguage(artifact.type, artifact.language);

  if (!artifact.content) {
    return null;
  }

  return (
    <div className="h-full w-full bg-[#1e1e1e]">
      <MonacoEditor
        height="100%"
        language={language}
        theme="vs-dark"
        defaultValue={artifact.content}
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
          scrollbar: {
            vertical: 'visible',
            horizontal: 'auto',
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
            useShadows: false,
            alwaysConsumeMouseWheel: false,
          },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          folding: false,
          glyphMargin: false,
          colorDecorators: !readOnly,
          occurrencesHighlight: readOnly ? 'off' : 'singleFile',
          selectionHighlight: !readOnly,
          renderValidationDecorations: readOnly ? 'off' : 'editable',
          quickSuggestions: !readOnly,
          suggestOnTriggerCharacters: !readOnly,
          parameterHints: { enabled: !readOnly },
          hover: { enabled: !readOnly },
          matchBrackets: readOnly ? 'never' : 'always',
        }}
      />
    </div>
  );
};
