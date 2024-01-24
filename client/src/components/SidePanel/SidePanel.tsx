import throttle from 'lodash/throttle';
import { useState, useRef, useCallback } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '~/components/ui/Resizable';
import { TooltipProvider, Tooltip } from '~/components/ui/Tooltip';
import { Separator } from '~/components/ui/Separator';
import AssistantPanel from './Builder/AssistantPanel';
import NavToggle from '~/components/Nav/NavToggle';
import { Blocks } from '~/components/svg';
import Switcher from './Switcher';
import { cn } from '~/utils';
import Nav from './Nav';

interface SidePanelProps {
  defaultLayout?: number[] | undefined;
  defaultCollapsed?: boolean;
  navCollapsedSize?: number;
  children: React.ReactNode;
}

export default function SidePanel({
  defaultLayout = [73, 27],
  defaultCollapsed = false,
  navCollapsedSize = 3,
  children,
}: SidePanelProps) {
  const [minSize, setMinSize] = useState(13.5);
  const [isHovering, setIsHovering] = useState(false);
  const [navVisible, setNavVisible] = useState(!defaultCollapsed);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [collapsedSize, setCollapsedSize] = useState(navCollapsedSize);

  const panelRef = useRef<ImperativePanelHandle>(null);

  const activePanel = localStorage.getItem('side:active-panel');
  const defaultActive = activePanel ? activePanel : undefined;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const throttledSaveLayout = useCallback(
    throttle((sizes: number[]) => {
      localStorage.setItem('react-resizable-panels:layout', JSON.stringify(sizes));
    }, 350),
    [],
  );

  const toggleNavVisible = () => {
    setNavVisible((prev: boolean) => {
      if (!prev) {
        setMinSize(0);
        setCollapsedSize(0);
      } else {
        setMinSize(13.5);
        setCollapsedSize(3);
      }
      return !prev;
    });
    if (!navVisible) {
      panelRef.current?.collapse();
    } else {
      panelRef.current?.expand();
    }
  };

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        direction="horizontal"
        onLayout={(sizes: number[]) => throttledSaveLayout(sizes)}
        className="h-full items-stretch"
      >
        <ResizablePanel defaultSize={defaultLayout[0]} minSize={30}>
          {children}
        </ResizablePanel>
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <div
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
              className="bg-border focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90"
            >
              <NavToggle
                navVisible={!isCollapsed}
                isHovering={isHovering}
                onToggle={toggleNavVisible}
                setIsHovering={setIsHovering}
                className="fixed top-1/2 mr-16"
                translateX={false}
                side="right"
              />
            </div>
          </Tooltip>
        </TooltipProvider>
        {(!isCollapsed || minSize > 0) && (
          <ResizableHandle withHandle className="bg-gray-100 dark:bg-gray-100/20 dark:text-white" />
        )}
        <ResizablePanel
          collapsedSize={collapsedSize}
          defaultSize={defaultLayout[1]}
          collapsible={true}
          minSize={minSize}
          maxSize={30}
          ref={panelRef}
          style={{
            overflowY: 'auto',
            transition: 'width 0.2s, visibility 0.2s',
          }}
          onExpand={() => {
            setIsCollapsed(false);
            setNavVisible(false);
            localStorage.setItem('react-resizable-panels:collapsed', 'false');
          }}
          onCollapse={() => {
            setNavVisible(true);
            setIsCollapsed(true);
            localStorage.setItem('react-resizable-panels:collapsed', 'true');
          }}
          className={cn(
            'sidenav dark:bg-black',
            isCollapsed ? 'transition-all duration-300 ease-in-out' : '',
            // isCollapsed ? 'min-w-[50px] transition-all duration-300 ease-in-out' : '',
          )}
        >
          <div
            className={cn(
              'flex h-[52px] items-center justify-center',
              isCollapsed ? 'h-[52px]' : 'px-2',
            )}
          >
            <Switcher isCollapsed={isCollapsed} />
          </div>
          <Separator className="bg-gray-100/50" />
          <Nav
            resize={panelRef.current?.resize}
            isCollapsed={isCollapsed}
            defaultActive={defaultActive}
            links={[
              {
                title: 'Assistant Builder',
                label: '',
                icon: Blocks,
                id: 'assistants',
                Component: AssistantPanel,
              },
            ]}
          />
          {/* <Separator className="bg-gray-100/50" /> */}
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  );
}
