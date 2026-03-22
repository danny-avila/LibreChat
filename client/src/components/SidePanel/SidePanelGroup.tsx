import { useState, memo, useCallback } from 'react';
import { ResizablePanel, ResizablePanelGroup, useMediaQuery } from '@librechat/client';
import ArtifactsPanel from './ArtifactsPanel';

const SidePanelGroup = memo(
  ({ artifacts, children }: { artifacts?: React.ReactNode; children: React.ReactNode }) => {
    const [shouldRenderArtifacts, setShouldRenderArtifacts] = useState(artifacts != null);
    const isSmallScreen = useMediaQuery('(max-width: 767px)');

    const minSizeMain = artifacts != null ? 15 : 30;

    return (
      <>
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId="side-panel-layout"
          className="relative flex-1 bg-presentation"
        >
          <ResizablePanel defaultSize={50} minSize={minSizeMain} id="messages-view">
            {children}
          </ResizablePanel>

          {!isSmallScreen && (
            <ArtifactsPanel
              artifacts={artifacts}
              minSizeMain={String(minSizeMain)}
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
  },
);

SidePanelGroup.displayName = 'SidePanelGroup';

export default SidePanelGroup;
