'use client';
import { useState, useRef } from 'react';
import {
  AlertCircle,
  Archive,
  File,
  Inbox,
  MessagesSquare,
  Send,
  ShoppingCart,
  Trash2,
  Users2,
} from 'lucide-react';

import type { ImperativePanelHandle } from 'react-resizable-panels';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '~/components/ui/Resizable';
import CreationPanel from '~/components/Chat/CreationPanel';
import { TooltipProvider } from '~/components/ui/Tooltip';
import { Separator } from '~/components/ui/Separator';
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
                icon: Inbox,
                id: 'inbox',
                Component: CreationPanel,
              },
              {
                title: 'Drafts',
                label: '9',
                icon: File,
                id: 'drafts',
              },
              {
                title: 'Sent',
                label: '',
                icon: Send,
                id: 'sent',
              },
              {
                title: 'Trash',
                label: '',
                icon: Trash2,
                id: 'trash',
              },
              {
                title: 'Archive',
                label: '',
                icon: Archive,
                id: 'archive',
              },
            ]}
          />
          <Separator className="bg-gray-100/50" />
          <Nav
            isCollapsed={isCollapsed}
            links={[
              {
                title: 'Social',
                label: '972',
                icon: Users2,
                id: 'social',
              },
              {
                title: 'Updates',
                label: '342',
                icon: AlertCircle,
                id: 'updates',
              },
              {
                title: 'Forums',
                label: '128',
                icon: MessagesSquare,
                id: 'forums',
              },
              {
                title: 'Shopping',
                label: '8',
                icon: ShoppingCart,
                id: 'shopping',
              },
              {
                title: 'Promotions',
                label: '21',
                icon: Archive,
                id: 'promotions',
              },
            ]}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  );
}
