import { useRef, useEffect, useMemo } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import type { SandpackPreviewRef, CodeEditorRef } from '@codesandbox/sandpack-react';
import type { Artifact } from '~/common';
import { useEditorContext, useArtifactsContext } from '~/Providers';
import useArtifactProps from '~/hooks/Artifacts/useArtifactProps';
import { useAutoScroll } from '~/hooks/Artifacts/useAutoScroll';
import { ArtifactCodeEditor } from './ArtifactCodeEditor';
import { useGetStartupConfig } from '~/data-provider';
import { ArtifactPreview } from './ArtifactPreview';
import { MermaidMarkdown } from './MermaidMarkdown';
import PDFArtifact from './PDFArtifact';
import { cn } from '~/utils';

export default function ArtifactTabs({
  artifact,
  isMermaid,
  editorRef,
  previewRef,
  initialPage,
  onPageChange,
}: {
  artifact: Artifact;
  isMermaid: boolean;
  editorRef: React.MutableRefObject<CodeEditorRef>;
  previewRef: React.MutableRefObject<SandpackPreviewRef>;
  initialPage?: number;
  onPageChange?: (page: number) => void;
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

  // Check if this is a PDF artifact
  const isPDF = useMemo(() => {
    const fileName = (artifact as any).filename || (artifact as any).name || '';
    const fileType = (artifact as any).type || '';
    return fileName.toLowerCase().endsWith('.pdf') || fileType.includes('pdf');
  }, [artifact]);
  return (
    <>
      {!isPDF && (
        <Tabs.Content
          ref={contentRef}
          value="code"
          id="artifacts-code"
          className={cn('flex-grow overflow-auto')}
        >
          {isMermaid ? (
            <MermaidMarkdown content={content} isSubmitting={isSubmitting} />
          ) : (
            <ArtifactCodeEditor
              files={files}
              fileKey={fileKey}
              template={template}
              artifact={artifact}
              editorRef={editorRef}
              sharedProps={sharedProps}
            />
          )}
        </Tabs.Content>
      )}
      <Tabs.Content value="preview" className="flex-grow overflow-auto">
        {isPDF ? (
          <PDFArtifact
            artifact={artifact}
            initialPage={initialPage}
            onPageChange={onPageChange}
            className="h-full"
          />
        ) : (
          <ArtifactPreview
            files={files}
            fileKey={fileKey}
            template={template}
            isMermaid={isMermaid}
            previewRef={previewRef}
            sharedProps={sharedProps}
            currentCode={currentCode}
            startupConfig={startupConfig}
          />
        )}
      </Tabs.Content>
    </>
  );
}
