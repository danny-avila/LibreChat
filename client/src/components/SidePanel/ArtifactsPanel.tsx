import { useRef, useEffect, memo } from 'react';
import { ResizableHandleAlt, ResizablePanel } from '@librechat/client';
import type { ImperativePanelHandle } from 'react-resizable-panels';

const ANIMATION_DURATION = 500;

interface ArtifactsPanelProps {
  artifacts: React.ReactNode | null;
  currentLayout: number[];
  minSizeMain: number;
  shouldRender: boolean;
  onRenderChange: (shouldRender: boolean) => void;
}

/**
 * ArtifactsPanel component - memoized to prevent unnecessary re-renders
 * Only re-renders when artifacts visibility or layout changes
 */
const ArtifactsPanel = memo(function ArtifactsPanel({
  artifacts,
  currentLayout,
  minSizeMain,
  shouldRender,
  onRenderChange,
}: ArtifactsPanelProps) {
  const artifactsPanelRef = useRef<ImperativePanelHandle>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (artifacts != null) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      onRenderChange(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          artifactsPanelRef.current?.expand();
        });
      });
    } else if (shouldRender) {
      artifactsPanelRef.current?.collapse();
      timeoutRef.current = setTimeout(() => {
        onRenderChange(false);
      }, ANIMATION_DURATION);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [artifacts, shouldRender, onRenderChange]);

  if (!shouldRender) {
    return null;
  }

  return (
    <>
      {artifacts != null && (
        <ResizableHandleAlt withHandle className="bg-border-medium text-text-primary" />
      )}
      <ResizablePanel
        ref={artifactsPanelRef}
        defaultSize={artifacts != null ? currentLayout[1] : 0}
        minSize={minSizeMain}
        maxSize={70}
        collapsible={true}
        collapsedSize={0}
        order={2}
        id="artifacts-panel"
      >
        <div className="h-full min-w-[400px] overflow-hidden">{artifacts}</div>
      </ResizablePanel>
    </>
  );
});

ArtifactsPanel.displayName = 'ArtifactsPanel';

export default ArtifactsPanel;
