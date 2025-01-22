import React, { useMemo, memo } from 'react';
import { removeNullishValues } from 'librechat-data-provider';
import {
  SandpackCodeEditor,
  SandpackProvider as StyledProvider,
} from '@codesandbox/sandpack-react';
import { SandpackPreview, SandpackProvider } from '@codesandbox/sandpack-react/unstyled';
import type { SandpackPreviewRef } from '@codesandbox/sandpack-react/unstyled';
import type { Artifact } from '~/common';
import {
  getKey,
  getProps,
  sharedFiles,
  getTemplate,
  sharedOptions,
  getArtifactFilename,
} from '~/utils/artifacts';
import { getMermaidFiles } from '~/utils/mermaid';

export const ArtifactPreview = memo(function ({
  showEditor = false,
  artifact,
  previewRef,
}: {
  showEditor?: boolean;
  artifact: Artifact;
  previewRef: React.MutableRefObject<SandpackPreviewRef>;
}) {
  const files = useMemo(() => {
    if (getKey(artifact.type ?? '', artifact.language).includes('mermaid')) {
      return getMermaidFiles(artifact.content ?? '');
    }
    return removeNullishValues({
      [getArtifactFilename(artifact.type ?? '', artifact.language)]: artifact.content,
    });
  }, [artifact.type, artifact.content, artifact.language]);

  const template = useMemo(
    () => getTemplate(artifact.type ?? '', artifact.language),
    [artifact.type, artifact.language],
  );

  const sharedProps = useMemo(() => getProps(artifact.type ?? ''), [artifact.type]);

  if (Object.keys(files).length === 0) {
    return null;
  }

  return showEditor ? (
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
        showTabs={false}
        showRunButton={false}
        className="hljs language-javascript bg-black"
      />
    </StyledProvider>
  ) : (
    <SandpackProvider
      files={{
        ...files,
        ...sharedFiles,
      }}
      options={{ ...sharedOptions }}
      {...sharedProps}
      template={template}
    >
      <SandpackPreview
        showOpenInCodeSandbox={false}
        showRefreshButton={false}
        tabIndex={0}
        ref={previewRef}
      />
    </SandpackProvider>
  );
});
