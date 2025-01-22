import * as Tabs from '@radix-ui/react-tabs';
import type { SandpackPreviewRef, CodeEditorRef } from '@codesandbox/sandpack-react';
import type { Artifact } from '~/common';
import useArtifactProps from '~/hooks/Artifacts/useArtifactProps';
import { ArtifactCodeEditor } from './ArtifactCodeEditor';
import { ArtifactPreview } from './ArtifactPreview';
import { cn } from '~/utils';

export default function ArtifactTabs({
  artifact,
  isMermaid,
  editorRef,
  previewRef,
}: {
  artifact: Artifact;
  isMermaid: boolean;
  editorRef: React.MutableRefObject<CodeEditorRef>;
  previewRef: React.MutableRefObject<SandpackPreviewRef>;
}) {
  const { files, fileKey, template, sharedProps } = useArtifactProps({ artifact });
  return (
    <>
      <Tabs.Content value="code" id="artifacts-code" className={cn('flex-grow overflow-auto')}>
        <ArtifactCodeEditor
          files={files}
          fileKey={fileKey}
          template={template}
          editorRef={editorRef}
          sharedProps={sharedProps}
        />
      </Tabs.Content>
      <Tabs.Content
        value="preview"
        className={cn('flex-grow overflow-auto', isMermaid ? 'bg-[#282C34]' : 'bg-white')}
      >
        <ArtifactPreview
          files={files}
          template={template}
          previewRef={previewRef}
          sharedProps={sharedProps}
        />
      </Tabs.Content>
    </>
  );
}
