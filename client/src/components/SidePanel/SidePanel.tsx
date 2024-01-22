import { useState, useRef } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '~/components/ui/Resizable';
import { TooltipProvider } from '~/components/ui/Tooltip';
import { Separator } from '~/components/ui/Separator';
import { Blocks } from '~/components/svg';
import AssistantPanel from './AssistantPanel';
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
  defaultLayout = [75, 20],
  defaultCollapsed = false,
  navCollapsedSize = 3,
  children,
}: SidePanelProps) {
  const panelRef = useRef<ImperativePanelHandle>(null);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        direction="horizontal"
        // onLayout={(sizes: number[]) => {
        // localStorage.setItem('react-resizable-panels:layout', JSON.stringify(sizes));
        // }}
        className="h-full items-stretch"
      >
        <ResizablePanel defaultSize={defaultLayout[0]} minSize={30}>
          {children}
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-gray-100 dark:bg-gray-100/20 dark:text-white" />
        <ResizablePanel
          collapsedSize={navCollapsedSize}
          defaultSize={defaultLayout[1]}
          collapsible={true}
          minSize={10}
          maxSize={30}
          ref={panelRef}
          style={{ overflowY: 'auto' }}
          onExpand={() => {
            setIsCollapsed(false);
            // localStorage.setItem(
            //   'react-resizable-panels:collapsed',
            //   JSON.stringify(false),
            // );
          }}
          onCollapse={() => {
            setIsCollapsed(true);
            // localStorage.setItem(
            //   'react-resizable-panels:collapsed',
            //   JSON.stringify(true),
            // );
          }}
          className={cn(
            'sidenav dark:bg-black',
            isCollapsed ? 'min-w-[50px] transition-all duration-300 ease-in-out' : '',
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
