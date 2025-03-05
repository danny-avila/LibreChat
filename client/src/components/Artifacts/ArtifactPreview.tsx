import React, { memo, useMemo } from 'react';
import {
  SandpackPreview,
  SandpackProvider,
  SandpackProviderProps,
} from '@codesandbox/sandpack-react/unstyled';
import type { SandpackPreviewRef } from '@codesandbox/sandpack-react/unstyled';
import type { ArtifactFiles } from '~/common';
import { sharedFiles, sharedOptions } from '~/utils/artifacts';
import { useGetStartupConfig } from '~/data-provider';
import { useEditorContext } from '~/Providers';

export const ArtifactPreview = memo(function ({
  files,
  fileKey,
  previewRef,
  sharedProps,
  template,
}: {
  files: ArtifactFiles;
  fileKey: string;
  template: SandpackProviderProps['template'];
  sharedProps: Partial<SandpackProviderProps>;
  previewRef: React.MutableRefObject<SandpackPreviewRef>;
}) {
  const { currentCode } = useEditorContext();
  const { data: config } = useGetStartupConfig();

  const artifactFiles = useMemo(() => {
    if (Object.keys(files).length === 0) {
      return files;
    }
    const code = currentCode ?? '';
    if (!code) {
      return files;
    }
    return {
      ...files,
      [fileKey]: {
        code,
      },
    };
  }, [currentCode, files, fileKey]);

  const options: typeof sharedOptions = useMemo(() => {
    if (!config) {
      return sharedOptions;
    }
    return {
      ...sharedOptions,
      bundlerURL: config.bundlerURL,
    };
  }, [config]);

  if (Object.keys(artifactFiles).length === 0) {
    return null;
  }

  return (
    <SandpackProvider
      files={{
        ...artifactFiles,
        ...sharedFiles,
      }}
      options={options}
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
