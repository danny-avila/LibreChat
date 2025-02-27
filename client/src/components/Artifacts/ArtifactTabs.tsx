import { useRef } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import type { SandpackPreviewRef, CodeEditorRef } from '@codesandbox/sandpack-react';
import type { Artifact } from '~/common';
import useArtifactProps from '~/hooks/Artifacts/useArtifactProps';
import { useAutoScroll } from '~/hooks/Artifacts/useAutoScroll';
import { ArtifactCodeEditor } from './ArtifactCodeEditor';
import { ArtifactPreview } from './ArtifactPreview';
import { cn } from '~/utils';

export default function ArtifactTabs({
  artifact,
  isMermaid,
  editorRef,
  previewRef,
  isSubmitting,
}: {
  artifact: Artifact;
  isMermaid: boolean;
  isSubmitting: boolean;
  editorRef: React.MutableRefObject<CodeEditorRef>;
  previewRef: React.MutableRefObject<SandpackPreviewRef>;
}) {
  const content = artifact.content ?? '';
  const contentRef = useRef<HTMLDivElement>(null);
  useAutoScroll({ ref: contentRef, content, isSubmitting });
  const { files, fileKey, template, sharedProps } = useArtifactProps({ artifact });
  return (
    <>
      <Tabs.Content
        ref={contentRef}
        value="code"
        id="artifacts-code"
        className={cn('grow overflow-auto')}
      >
        <ArtifactCodeEditor
          files={files}
          fileKey={fileKey}
          template={template}
          artifact={artifact}
          editorRef={editorRef}
          sharedProps={sharedProps}
          isSubmitting={isSubmitting}
        />
      </Tabs.Content>
      <Tabs.Content
        value="preview"
        className={cn('grow overflow-auto', isMermaid ? 'bg-[#282C34]' : 'bg-white')}
      >
        <ArtifactPreview
          files={files}
          fileKey={fileKey}
          template={template}
          previewRef={previewRef}
          sharedProps={sharedProps}
        />
      </Tabs.Content>
    </>
  );
}
