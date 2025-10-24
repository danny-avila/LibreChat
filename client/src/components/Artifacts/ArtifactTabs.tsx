import { useRef, useEffect } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import type { SandpackPreviewRef } from '@codesandbox/sandpack-react/unstyled';
import type { CodeEditorRef } from '@codesandbox/sandpack-react';
import type { Artifact } from '~/common';
import { useEditorContext, useArtifactsContext } from '~/Providers';
import useArtifactProps from '~/hooks/Artifacts/useArtifactProps';
import { useAutoScroll } from '~/hooks/Artifacts/useAutoScroll';
import { ArtifactCodeEditor } from './ArtifactCodeEditor';
import { useGetStartupConfig } from '~/data-provider';
import { ArtifactPreview } from './ArtifactPreview';
import { cn } from '~/utils';

export default function ArtifactTabs({
  artifact,
  editorRef,
  previewRef,
}: {
  artifact: Artifact;
  editorRef: React.MutableRefObject<CodeEditorRef>;
  previewRef: React.MutableRefObject<SandpackPreviewRef>;
}) {
  const { isSubmitting } = useArtifactsContext();
  const { currentCode, setCurrentCode } = useEditorContext();
  const { data: startupConfig } = useGetStartupConfig();
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (artifact.id !== lastIdRef.current) {
      setCurrentCode(undefined);
    }
    lastIdRef.current = artifact.id;
  }, [setCurrentCode, artifact.id]);

  const content = artifact.content ?? '';
  const contentRef = useRef<HTMLDivElement>(null);
  useAutoScroll({ ref: contentRef, content, isSubmitting });

  const { files, fileKey, template, sharedProps } = useArtifactProps({ artifact });

  return (
    <div className="flex h-full w-full flex-col">
      <Tabs.Content
        ref={contentRef}
        value="code"
        id="artifacts-code"
        className={cn(
          'h-full w-full flex-grow overflow-auto',
          'data-[state=active]:duration-200 data-[state=active]:animate-in data-[state=active]:fade-in-0',
          'data-[state=inactive]:duration-150 data-[state=inactive]:animate-out data-[state=inactive]:fade-out-0',
        )}
        tabIndex={-1}
      >
        <ArtifactCodeEditor
          files={files}
          fileKey={fileKey}
          template={template}
          artifact={artifact}
          editorRef={editorRef}
          sharedProps={sharedProps}
        />
      </Tabs.Content>

      <Tabs.Content
        value="preview"
        className={cn(
          'h-full w-full flex-grow overflow-auto',
          'data-[state=active]:duration-200 data-[state=active]:animate-in data-[state=active]:fade-in-0',
          'data-[state=inactive]:duration-150 data-[state=inactive]:animate-out data-[state=inactive]:fade-out-0',
        )}
        tabIndex={-1}
      >
        <ArtifactPreview
          files={files}
          fileKey={fileKey}
          template={template}
          previewRef={previewRef}
          sharedProps={sharedProps}
          currentCode={currentCode}
          startupConfig={startupConfig}
        />
      </Tabs.Content>
    </div>
  );
}
