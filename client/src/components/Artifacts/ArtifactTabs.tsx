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

export default function ArtifactTabs({
  artifact,
  editorRef,
  previewRef,
  activeTab,
}: {
  artifact: Artifact;
  editorRef: React.MutableRefObject<CodeEditorRef>;
  previewRef: React.MutableRefObject<SandpackPreviewRef>;
  activeTab: string;
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
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isResizingRef = useRef(false);
  useAutoScroll({ ref: contentRef, content, isSubmitting });

  const { files, fileKey, template, sharedProps } = useArtifactProps({ artifact });

  // Disable pointer events during resize to prevent lag
  useEffect(() => {
    const previewContainer = previewContainerRef.current;
    if (!previewContainer || activeTab !== 'preview') {
      return;
    }

    // Use throttled resize handling to avoid feedback loops
    let rafId: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      // Use RAF to batch visual updates and avoid triggering more resize events
      rafId = requestAnimationFrame(() => {
        if (!isResizingRef.current) {
          isResizingRef.current = true;
          if (previewContainer) {
            previewContainer.style.pointerEvents = 'none';
          }
        }

        // Clear existing timeout
        if (resizeTimeoutRef.current) {
          clearTimeout(resizeTimeoutRef.current);
        }

        // Re-enable pointer events after resize stops
        resizeTimeoutRef.current = setTimeout(() => {
          isResizingRef.current = false;
          if (previewContainer) {
            previewContainer.style.pointerEvents = 'auto';
          }
        }, 100);
      });
    });

    resizeObserver.observe(previewContainer);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      resizeObserver.disconnect();
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      isResizingRef.current = false;
    };
  }, [activeTab, previewRef]);

  return (
    <div className="flex h-full w-full flex-col">
      <Tabs.Content
        ref={contentRef}
        value="code"
        id="artifacts-code"
        className="h-full w-full flex-grow"
        tabIndex={-1}
        style={{
          contain: 'strict',
          contentVisibility: activeTab === 'code' ? 'visible' : 'hidden',
          pointerEvents: activeTab === 'code' ? 'auto' : 'none',
        }}
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
        ref={previewContainerRef}
        value="preview"
        className="h-full w-full flex-grow"
        tabIndex={-1}
        style={{
          contain: 'strict',
          contentVisibility: activeTab === 'preview' ? 'visible' : 'hidden',
          pointerEvents: activeTab === 'preview' ? 'auto' : 'none',
        }}
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
