import React, { memo } from 'react';
import {
  SandpackPreview,
  SandpackProvider,
  SandpackProviderProps,
} from '@codesandbox/sandpack-react/unstyled';
import type { SandpackPreviewRef } from '@codesandbox/sandpack-react/unstyled';
import type { ArtifactFiles } from '~/common';
import { sharedFiles, sharedOptions } from '~/utils/artifacts';

export const ArtifactPreview = memo(function ({
  files,
  previewRef,
  sharedProps,
  template,
}: {
  files: ArtifactFiles;
  template: SandpackProviderProps['template'];
  sharedProps: Partial<SandpackProviderProps>;
  previewRef: React.MutableRefObject<SandpackPreviewRef>;
}) {
  if (Object.keys(files).length === 0) {
    return null;
  }

  return (
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
