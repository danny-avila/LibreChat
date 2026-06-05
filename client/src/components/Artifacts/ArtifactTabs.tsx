import { useRef, useEffect } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import type { SandpackPreviewRef } from '@codesandbox/sandpack-react/unstyled';
import type { editor } from 'monaco-editor';
import type { Artifact } from '~/common';
import { useCodeState } from '~/Providers/EditorContext';
import useArtifactProps from '~/hooks/Artifacts/useArtifactProps';
import { ArtifactCodeEditor } from './ArtifactCodeEditor';
import { useGetStartupConfig } from '~/data-provider';
import { isLiveArtifact } from '~/utils/liveArtifact';
import LiveArtifactPreview from './LiveArtifactPreview';
import { ArtifactPreview } from './ArtifactPreview';

export default function ArtifactTabs({
  artifact,
  previewRef,
  isSharedConvo,
}: {
  artifact: Artifact;
  previewRef: React.MutableRefObject<SandpackPreviewRef>;
  isSharedConvo?: boolean;
}) {
  const { currentCode, setCurrentCode } = useCodeState();
  const { data: startupConfig } = useGetStartupConfig();
  const monacoRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (artifact.id !== lastIdRef.current) {
      setCurrentCode(undefined);
    }
    lastIdRef.current = artifact.id;
  }, [setCurrentCode, artifact.id]);

  const { files, fileKey, template, sharedProps } = useArtifactProps({ artifact });
  // Require a real fileId: the bridge keys off it, so a live render without one
  // would 400 every tool call. Fall back to the static Sandpack preview instead.
  const live = isLiveArtifact(artifact.type, artifact.tools) && Boolean(artifact.fileId);

  return (
    <div className="flex h-full w-full flex-col">
      <Tabs.Content
        value="code"
        id="artifacts-code"
        className="h-full w-full flex-grow overflow-auto"
        tabIndex={-1}
      >
        <ArtifactCodeEditor artifact={artifact} monacoRef={monacoRef} readOnly={isSharedConvo} />
      </Tabs.Content>

      <Tabs.Content
        value="preview"
        className="h-full w-full flex-grow overflow-hidden"
        tabIndex={-1}
      >
        {live ? (
          <LiveArtifactPreview
            content={currentCode ?? artifact.content ?? ''}
            fileId={artifact.fileId ?? ''}
            messageId={artifact.messageId}
            conversationId={artifact.conversationId}
          />
        ) : (
          <ArtifactPreview
            files={files}
            fileKey={fileKey}
            template={template}
            previewRef={previewRef}
            sharedProps={sharedProps}
            currentCode={currentCode}
            startupConfig={startupConfig}
          />
        )}
      </Tabs.Content>
    </div>
  );
}
