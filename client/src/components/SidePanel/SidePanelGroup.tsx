import { useState, useEffect, useMemo, memo } from 'react';
import throttle from 'lodash/throttle';
import { ResizablePanel, ResizablePanelGroup, useMediaQuery } from '@librechat/client';
import ArtifactsPanel from './ArtifactsPanel';
import { normalizeLayout } from '~/utils';

interface SidePanelProps {
  artifacts?: React.ReactNode;
  children: React.ReactNode;
}

const SidePanelGroup = memo(({ artifacts, children }: SidePanelProps) => {
  const [shouldRenderArtifacts, setShouldRenderArtifacts] = useState(artifacts != null);
  const isSmallScreen = useMediaQuery('(max-width: 767px)');

  const currentLayout = useMemo(() => {
    if (artifacts == null) {
      return [100];
    }
    return normalizeLayout([50, 50]);
  }, [artifacts]);

  const throttledSaveLayout = useMemo(
    () =>
      throttle((sizes: number[]) => {
        const normalizedSizes = normalizeLayout(sizes);
        localStorage.setItem('react-resizable-panels:layout', JSON.stringify(normalizedSizes));
      }, 350),
    [],
  );

  useEffect(() => () => throttledSaveLayout.cancel(), [throttledSaveLayout]);

  const minSizeMain = useMemo(() => (artifacts != null ? 15 : 30), [artifacts]);

  return (
    <>
      <ResizablePanelGroup
        direction="horizontal"
        onLayout={(sizes) => throttledSaveLayout(sizes)}
        className="relative h-full w-full flex-1 overflow-auto bg-presentation"
      >
        <ResizablePanel
          defaultSize={currentLayout[0]}
          minSize={minSizeMain}
          order={1}
          id="messages-view"
        >
          {children}
        </ResizablePanel>

        {!isSmallScreen && (
          <ArtifactsPanel
            artifacts={artifacts}
            currentLayout={currentLayout}
            minSizeMain={minSizeMain}
            shouldRender={shouldRenderArtifacts}
            onRenderChange={setShouldRenderArtifacts}
          />
        )}
      </ResizablePanelGroup>
      {artifacts != null && isSmallScreen && (
        <div className="fixed inset-0 z-[100]">{artifacts}</div>
      )}
    </>
  );
});

SidePanelGroup.displayName = 'SidePanelGroup';

export default SidePanelGroup;
