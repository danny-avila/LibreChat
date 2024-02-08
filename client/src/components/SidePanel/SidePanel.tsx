import throttle from 'lodash/throttle';
import { useState, useRef, useCallback, useEffect } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { ResizableHandleAlt, ResizablePanel, ResizablePanelGroup } from '~/components/ui/Resizable';
import { TooltipProvider, Tooltip } from '~/components/ui/Tooltip';
import { Blocks, AttachmentIcon } from '~/components/svg';
import { Separator } from '~/components/ui/Separator';
import NavToggle from '~/components/Nav/NavToggle';
import PanelSwitch from './Builder/PanelSwitch';
import { useMediaQuery } from '~/hooks';
import FilesPanel from './Files/Panel';
import Switcher from './Switcher';
import { cn } from '~/utils';
import Nav from './Nav';

interface SidePanelProps {
  defaultLayout?: number[] | undefined;
  defaultCollapsed?: boolean;
  navCollapsedSize?: number;
  children: React.ReactNode;
}

const defaultMinSize = 20;

export default function SidePanel({
  defaultLayout = [73, 27],
  defaultCollapsed = false,
  navCollapsedSize = 3,
  children,
}: SidePanelProps) {
  const [minSize, setMinSize] = useState(defaultMinSize);
  const [isHovering, setIsHovering] = useState(false);
  // const [navVisible, setNavVisible] = useState(!defaultCollapsed);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [collapsedSize, setCollapsedSize] = useState(navCollapsedSize);
  const isSmallScreen = useMediaQuery('(max-width: 767px)');

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

  useEffect(() => {
    if (isSmallScreen) {
      setIsCollapsed(true);
      setMinSize(0);
      setCollapsedSize(0);
      panelRef.current?.collapse();
      return;
    }
  }, [isSmallScreen]);

  const toggleNavVisible = () => {
    setIsCollapsed((prev: boolean) => {
      if (!prev) {
        setMinSize(0);
        setCollapsedSize(0);
      } else {
        setMinSize(defaultMinSize);
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

  return (
    <>
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
              'sidenav border-l border-gray-200 dark:border-gray-800/50 dark:bg-black',
              isCollapsed ? 'min-w-[50px]' : 'min-w-[340px] sm:min-w-[352px]',
              minSize === 0 ? 'min-w-0' : '',
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
                  Component: PanelSwitch,
                },
                {
                  title: 'Attach Files',
                  label: '',
                  icon: AttachmentIcon,
                  id: 'files',
                  Component: FilesPanel,
                },
              ]}
            />
            {/* <Separator className="bg-gray-100/50" /> */}
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
