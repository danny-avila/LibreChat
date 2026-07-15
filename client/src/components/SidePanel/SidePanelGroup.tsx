import { useEffect, useState, memo } from 'react';
import { useDefaultLayout } from 'react-resizable-panels';
import { ResizablePanel, ResizablePanelGroup, useMediaQuery } from '@librechat/client';
import OneCodeConsolePanel from '~/components/OneCode/OneCodeConsolePanel';
import {
  ONECODE_CONSOLE_OPEN_EVENT,
  type OneCodeConsoleOpenDetail,
  type OneCodeConsoleTab,
} from '~/onecode/console';
import ArtifactsPanel from './ArtifactsPanel';

const PANEL_IDS_SINGLE = ['messages-view'];
const PANEL_IDS_SPLIT = ['messages-view', 'artifacts-panel'];

interface SidePanelProps {
  artifacts?: React.ReactNode;
  children: React.ReactNode;
}

const SidePanelGroup = memo(({ artifacts, children }: SidePanelProps) => {
  const [showOneCodeConsole, setShowOneCodeConsole] = useState(false);
  const [oneCodeInitialTab, setOneCodeInitialTab] = useState<OneCodeConsoleTab>('project');
  const [shouldRenderArtifacts, setShouldRenderArtifacts] = useState(artifacts != null);
  const isSmallScreen = useMediaQuery('(max-width: 767px)');
  const sideContent = showOneCodeConsole ? (
    <OneCodeConsolePanel
      initialTab={oneCodeInitialTab}
      onClose={() => setShowOneCodeConsole(false)}
    />
  ) : (
    artifacts
  );
  const hasSideContent = sideContent != null;

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'side-panel-layout',
    panelIds: hasSideContent ? PANEL_IDS_SPLIT : PANEL_IDS_SINGLE,
    storage: localStorage,
  });

  const minSizeMain = hasSideContent ? '15' : '30';

  useEffect(() => {
    const openConsole = (event: Event) => {
      const detail = (event as CustomEvent<OneCodeConsoleOpenDetail>).detail;
      if (detail?.tab) {
        setOneCodeInitialTab(detail.tab);
      }
      setShowOneCodeConsole(true);
    };
    window.addEventListener(ONECODE_CONSOLE_OPEN_EVENT, openConsole);
    return () => window.removeEventListener(ONECODE_CONSOLE_OPEN_EVENT, openConsole);
  }, []);

  useEffect(() => {
    if (hasSideContent) {
      setShouldRenderArtifacts(true);
    }
  }, [hasSideContent]);

  return (
    <>
      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="relative flex-1 bg-presentation"
      >
        <ResizablePanel defaultSize="50" minSize={minSizeMain} id="messages-view">
          {children}
        </ResizablePanel>

        {!isSmallScreen && (
          <ArtifactsPanel
            artifacts={sideContent}
            minSizeMain={minSizeMain}
            shouldRender={shouldRenderArtifacts}
            onRenderChange={setShouldRenderArtifacts}
          />
        )}
      </ResizablePanelGroup>
      {hasSideContent && isSmallScreen && (
        <div className="fixed inset-0 z-[100]">{sideContent}</div>
      )}
    </>
  );
});

SidePanelGroup.displayName = 'SidePanelGroup';

export default SidePanelGroup;
