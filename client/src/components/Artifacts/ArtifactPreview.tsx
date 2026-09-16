import React, { memo, useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { SandpackPreview, SandpackProvider } from '@codesandbox/sandpack-react/unstyled';
import type {
  SandpackProviderProps,
  SandpackPreviewRef,
} from '@codesandbox/sandpack-react/unstyled';
import type { SandpackStartupConfig } from '~/utils/artifacts';
import type { ArtifactFiles } from '~/common';
import { sharedFiles, sharedOptions, buildSandpackOptions } from '~/utils/artifacts';
import { ARTIFACT_PREVIEW_BRIDGE_SCRIPT } from '~/utils/artifactPreviewCapture';
import { useLocalize } from '~/hooks';

type StaticPreviewRef = SandpackPreviewRef & {
  __staticPreview?: true;
};

function getFileCode(file: unknown): string | undefined {
  if (typeof file === 'string') {
    return file;
  }

  if (file && typeof file === 'object' && 'code' in file && typeof file.code === 'string') {
    return file.code;
  }

  return undefined;
}

function injectExternalResources(html: string): string {
  const externalScripts = sharedOptions?.externalResources
    ?.filter((resource): resource is string => typeof resource === 'string' && resource.length > 0)
    .map((resource) => resource.split('#')[0])
    .filter((resource) => !html.includes(resource))
    .map((resource) => `<script src="${resource}"></script>`)
    .join('\n');
  const scripts = [`<script>${ARTIFACT_PREVIEW_BRIDGE_SCRIPT}</script>`, externalScripts]
    .filter(Boolean)
    .join('\n');

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${scripts}\n</head>`);
  }

  return `${scripts}\n${html}`;
}

export const ArtifactPreview = memo(function ({
  files,
  fileKey,
  template,
  sharedProps,
  previewRef,
  currentCode,
  startupConfig,
}: {
  files: ArtifactFiles;
  fileKey: string;
  template: SandpackProviderProps['template'];
  sharedProps: Partial<SandpackProviderProps>;
  previewRef: MutableRefObject<SandpackPreviewRef>;
  currentCode?: string;
  startupConfig?: SandpackStartupConfig;
}) {
  const localize = useLocalize();
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
      [fileKey]: { code },
    };
  }, [currentCode, files, fileKey]);

  const options: SandpackProviderProps['options'] = useMemo(
    () => buildSandpackOptions(template, startupConfig),
    [startupConfig, template],
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const staticHtml = useMemo(() => {
    if (template !== 'static') {
      return undefined;
    }

    const html =
      getFileCode(artifactFiles['index.html']) ??
      (fileKey.endsWith('.html') ? getFileCode(artifactFiles[fileKey]) : undefined);

    return html ? injectExternalResources(html) : undefined;
  }, [artifactFiles, fileKey, template]);

  useEffect(() => {
    if (!staticHtml) {
      return;
    }

    const staticPreviewRef: StaticPreviewRef = {
      __staticPreview: true,
      clientId: 'static-artifact-preview',
      getClient: () =>
        ({
          dispatch: ({ type }: { type?: string }) => {
            if (type === 'refresh') {
              setRefreshKey((key) => key + 1);
            }
          },
        }) as ReturnType<SandpackPreviewRef['getClient']>,
    };

    previewRef.current = staticPreviewRef;

    return () => {
      if ((previewRef.current as StaticPreviewRef | undefined)?.__staticPreview) {
        (previewRef as MutableRefObject<SandpackPreviewRef | undefined>).current = undefined;
      }
    };
  }, [previewRef, staticHtml]);

  if (Object.keys(artifactFiles).length === 0) {
    return null;
  }

  if (staticHtml) {
    return (
      <iframe
        key={refreshKey}
        title={localize('com_ui_artifact_app_preview')}
        srcDoc={staticHtml}
        sandbox="allow-downloads allow-forms allow-modals allow-pointer-lock allow-popups allow-presentation allow-scripts"
        className="h-full w-full border-0 bg-white"
        tabIndex={0}
      />
    );
  }

  return (
    <SandpackProvider
      files={{ ...artifactFiles, ...sharedFiles }}
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
