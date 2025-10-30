import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import throttle from 'lodash/throttle';
import { useRecoilValue } from 'recoil';
import { getConfigDefaults } from 'librechat-data-provider';
import {
  ResizableHandleAlt,
  ResizablePanel,
  ResizablePanelGroup,
  useMediaQuery,
} from '@librechat/client';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { useGetStartupConfig } from '~/data-provider';
import { normalizeLayout } from '~/utils';
import SidePanel from './SidePanel';
import store from '~/store';

const ANIMATION_DURATION = 500;

interface SidePanelProps {
  defaultLayout?: number[] | undefined;
  defaultCollapsed?: boolean;
  navCollapsedSize?: number;
  fullPanelCollapse?: boolean;
  artifacts?: React.ReactNode;
  children: React.ReactNode;
}

const defaultMinSize = 20;
const defaultInterface = getConfigDefaults().interface;

const SidePanelGroup = memo(
  ({
    defaultLayout = [97, 3],
    defaultCollapsed = false,
    fullPanelCollapse = false,
    navCollapsedSize = 3,
    artifacts,
    children,
  }: SidePanelProps) => {
    const { data: startupConfig } = useGetStartupConfig();
    const interfaceConfig = useMemo(
      () => startupConfig?.interface ?? defaultInterface,
      [startupConfig],
    );

    const panelRef = useRef<ImperativePanelHandle>(null);
    const artifactsPanelRef = useRef<ImperativePanelHandle>(null);
    const [minSize, setMinSize] = useState(defaultMinSize);
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const [fullCollapse, setFullCollapse] = useState(fullPanelCollapse);
    const [collapsedSize, setCollapsedSize] = useState(navCollapsedSize);
    const [shouldRenderArtifacts, setShouldRenderArtifacts] = useState(artifacts != null);
    const artifactsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const isSmallScreen = useMediaQuery('(max-width: 767px)');
    const hideSidePanel = useRecoilValue(store.hideSidePanel);

    useEffect(() => {
      if (artifacts != null) {
        if (artifactsTimeoutRef.current) {
          clearTimeout(artifactsTimeoutRef.current);
          artifactsTimeoutRef.current = null;
        }
        setShouldRenderArtifacts(true);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            artifactsPanelRef.current?.expand();
          });
        });
      } else if (shouldRenderArtifacts) {
        artifactsPanelRef.current?.collapse();
        artifactsTimeoutRef.current = setTimeout(() => {
          setShouldRenderArtifacts(false);
        }, ANIMATION_DURATION);
      }

      return () => {
        if (artifactsTimeoutRef.current) {
          clearTimeout(artifactsTimeoutRef.current);
        }
      };
    }, [artifacts, shouldRenderArtifacts]);

    const calculateLayout = useCallback(() => {
      if (artifacts == null) {
        const navSize = defaultLayout.length === 2 ? defaultLayout[1] : defaultLayout[2];
        return [100 - navSize, navSize];
      } else {
        const navSize = 0;
        const remainingSpace = 100 - navSize;
        const newMainSize = Math.floor(remainingSpace / 2);
        const artifactsSize = remainingSpace - newMainSize;
        return [newMainSize, artifactsSize, navSize];
      }
    }, [artifacts, defaultLayout]);

    const currentLayout = useMemo(() => normalizeLayout(calculateLayout()), [calculateLayout]);

    const throttledSaveLayout = useMemo(
      () =>
        throttle((sizes: number[]) => {
          const normalizedSizes = normalizeLayout(sizes);
          localStorage.setItem('react-resizable-panels:layout', JSON.stringify(normalizedSizes));
        }, 350),
      [],
    );

    useEffect(() => {
      if (isSmallScreen) {
        setIsCollapsed(true);
        setCollapsedSize(0);
        setMinSize(defaultMinSize);
        setFullCollapse(true);
        localStorage.setItem('fullPanelCollapse', 'true');
        panelRef.current?.collapse();
        return;
      } else {
        setIsCollapsed(defaultCollapsed);
        setCollapsedSize(navCollapsedSize);
        setMinSize(defaultMinSize);
      }
    }, [isSmallScreen, defaultCollapsed, navCollapsedSize, fullPanelCollapse]);

    const minSizeMain = useMemo(() => (artifacts != null ? 15 : 30), [artifacts]);

    /** Memoized close button handler to prevent re-creating it */
    const handleClosePanel = useCallback(() => {
      setIsCollapsed(() => {
        localStorage.setItem('fullPanelCollapse', 'true');
        setFullCollapse(true);
        setCollapsedSize(0);
        setMinSize(0);
        return false;
      });
      panelRef.current?.collapse();
    }, []);

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
            className="transition-width relative h-full w-full flex-1 overflow-auto bg-presentation"
          >
            {children}
          </ResizablePanel>
          {shouldRenderArtifacts && !isSmallScreen && (
            <>
              {artifacts != null && (
                <ResizableHandleAlt
                  withHandle
                  className="ml-3 bg-border-medium text-text-primary"
                />
              )}
              <ResizablePanel
                ref={artifactsPanelRef}
                defaultSize={artifacts != null ? currentLayout[1] : 0}
                minSize={minSizeMain}
                collapsible={true}
                collapsedSize={0}
                order={2}
                id="artifacts-panel"
              >
                <div className="h-full min-w-[400px] overflow-hidden">{artifacts}</div>
              </ResizablePanel>
            </>
          )}
          {!hideSidePanel && interfaceConfig.sidePanel === true && (
            <SidePanel
              panelRef={panelRef}
              minSize={minSize}
              setMinSize={setMinSize}
              isCollapsed={isCollapsed}
              setIsCollapsed={setIsCollapsed}
              collapsedSize={collapsedSize}
              setCollapsedSize={setCollapsedSize}
              fullCollapse={fullCollapse}
              setFullCollapse={setFullCollapse}
              defaultSize={currentLayout[currentLayout.length - 1]}
              hasArtifacts={artifacts != null}
              interfaceConfig={interfaceConfig}
            />
          )}
        </ResizablePanelGroup>
        {artifacts != null && isSmallScreen && (
          <div className="fixed inset-0 z-[100]">{artifacts}</div>
        )}
        <button
          aria-label="Close right side panel"
          className={`nav-mask ${!isCollapsed ? 'active' : ''}`}
          onClick={handleClosePanel}
        />
      </>
    );
  },
);

SidePanelGroup.displayName = 'SidePanelGroup';

export default SidePanelGroup;
