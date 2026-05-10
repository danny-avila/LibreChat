import { useEffect, memo } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import { ResizableHandleAlt, ResizablePanel } from '@librechat/client';

interface ArtifactsPanelProps {
  artifacts: React.ReactNode | null;
  minSizeMain: string;
  shouldRender: boolean;
  onRenderChange: (shouldRender: boolean) => void;
}

const ArtifactsPanel = memo(function ArtifactsPanel({
  artifacts,
  minSizeMain,
  shouldRender,
  onRenderChange,
}: ArtifactsPanelProps) {
  const artifactsPanelRef = usePanelRef();

  useEffect(() => {
    if (artifacts != null) {
      onRenderChange(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          artifactsPanelRef.current?.expand();
        });
      });
    } else if (shouldRender) {
      onRenderChange(false);
    }
  }, [artifacts, shouldRender, onRenderChange, artifactsPanelRef]);

  if (!shouldRender) {
    return null;
  }

  return (
    <>
      {artifacts != null && (
        <ResizableHandleAlt withHandle className="bg-border-medium text-text-primary" />
      )}
      <ResizablePanel
        defaultSize="50"
        maxSize="70"
        collapsedSize="0"
        collapsible={true}
        minSize={minSizeMain}
        panelRef={artifactsPanelRef}
        id="artifacts-panel"
      >
        <div className="h-full min-w-[400px] overflow-hidden">{artifacts}</div>
      </ResizablePanel>
    </>
  );
});

ArtifactsPanel.displayName = 'ArtifactsPanel';

export default ArtifactsPanel;
