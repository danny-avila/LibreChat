import React, { memo } from 'react';
import throttle from 'lodash/throttle';
import { useState, useRef, useCallback } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { ResizableHandleAlt, ResizablePanel, ResizablePanelGroup } from '~/components/ui/Resizable';
import { TooltipProvider, Tooltip } from '~/components/ui/Tooltip';
import { useLocalStorage, useToast } from '~/hooks';
import NavToggle from '~/components/Nav/NavToggle';
import { cn } from '~/utils';
import Users from './Users';
import ShareIcon from '~/components/svg/ShareIcon';
import RoomReport from '~/components/Chat/RoomReport';
import { useParams } from 'react-router-dom';
import copy from 'copy-to-clipboard';

interface UserListProps {
  defaultLayout?: number[] | undefined;
  defaultCollapsed?: boolean;
  navCollapsedSize?: number;
  children: React.ReactNode;
}

const defaultMinSize = 0;
// const defaultMinSize = 20;

function UserList({
  defaultLayout = [97, 3],
  defaultCollapsed = false,
  navCollapsedSize = 3,
  children,
}: UserListProps) {
  const [minSize, setMinSize] = useState(defaultMinSize);
  const [isHovering, setIsHovering] = useState(false);
  const [newUser, setNewUser] = useLocalStorage('newUser', true);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [collapsedSize, setCollapsedSize] = useState(navCollapsedSize);
  const params = useParams();
  const { showToast } = useToast();

  const panelRef = useRef<ImperativePanelHandle>(null);

  // const activePanel = localStorage.getItem('side:active-panel');
  // const defaultActive = activePanel ? activePanel : undefined;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const throttledSaveLayout = useCallback(
    throttle((sizes: number[]) => {
      localStorage.setItem('react-resizable-panels:layout', JSON.stringify(sizes));
    }, 350),
    [],
  );

  const toggleNavVisible = () => {
    if (newUser) {
      setNewUser(false);
    }
    setIsCollapsed((prev: boolean) => {
      if (!prev) {
        setMinSize(defaultMinSize);
        setCollapsedSize(3);
      } else {
        // setMinSize(defaultMinSize);
        setCollapsedSize(3);
      }
      return !prev;
    });
    if (!isCollapsed) {
      panelRef.current?.collapse();
    } else {
      panelRef.current?.expand();
    }
  };

  const handleShare = () => {
    copy(window.location.href);
    showToast({ message: 'Copied the room link.', status: 'success' });
  };

  return (
    <>
      <TooltipProvider delayDuration={0}>
        <ResizablePanelGroup
          direction="horizontal"
          onLayout={(sizes: number[]) => throttledSaveLayout(sizes)}
          className="transition-width relative h-full w-full flex-1 overflow-auto bg-white dark:bg-gray-800"
        >
          <ResizablePanel defaultSize={defaultLayout[0]} minSize={30}>
            {children}
          </ResizablePanel>
          <TooltipProvider delayDuration={400}>
            <Tooltip>
              <div
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
                className="relative flex w-px items-center justify-center"
              >
                <NavToggle
                  navVisible={!isCollapsed}
                  isHovering={isHovering}
                  onToggle={toggleNavVisible}
                  setIsHovering={setIsHovering}
                  className={cn(
                    'fixed top-1/2',
                    isCollapsed && (minSize === 0 || collapsedSize === 0) ? 'mr-9' : 'mr-16',
                  )}
                  translateX={false}
                  side="right"
                />
              </div>
            </Tooltip>
          </TooltipProvider>
          {(!isCollapsed || minSize > 0) && (
            <ResizableHandleAlt withHandle className="bg-transparent dark:text-white" />
          )}
          <ResizablePanel
            collapsedSize={collapsedSize}
            defaultSize={defaultLayout[1]}
            collapsible={true}
            minSize={minSize}
            maxSize={40}
            ref={panelRef}
            style={{
              overflowY: 'auto',
              visibility:
                isCollapsed && (minSize === 0 || collapsedSize === 0) ? 'hidden' : 'visible',
              transition: 'width 0.2s ease',
            }}
            onExpand={() => {
              setIsCollapsed(false);
              localStorage.setItem('react-resizable-panels:collapsed', 'false');
            }}
            onCollapse={() => {
              setIsCollapsed(true);
              localStorage.setItem('react-resizable-panels:collapsed', 'true');
            }}
            className={cn(
              'sidenav hide-scrollbar relative border-l border-gray-200 bg-white p-1 dark:border-gray-800/50 dark:bg-gray-900',
              isCollapsed ? 'min-w-[50px]' : 'min-w-[250px] sm:min-w-[250px]',
              minSize === 0 ? 'min-w-0' : '',
            )}
          >
            <Users isCollapsed={isCollapsed} />
            <div className="absolute bottom-0 z-50 flex w-full flex-col rounded-md bg-white pb-3 dark:bg-gray-850">
              <button
                className="flex w-full cursor-pointer gap-3 rounded-md px-3 py-3 hover:bg-gray-50 dark:text-gray-200 hover:dark:bg-gray-700"
                onClick={handleShare}
              >
                <ShareIcon />
                <p>Share Room</p>
              </button>
              <RoomReport conversationId={params.conversationId ?? ''} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </TooltipProvider>
      <div
        className={`nav-mask${!isCollapsed ? ' active' : ''}`}
        onClick={() => {
          setIsCollapsed(() => {
            setCollapsedSize(0);
            setMinSize(0);
            return false;
          });
          panelRef.current?.collapse();
        }}
      />
    </>
  );
}

export default memo(UserList);
