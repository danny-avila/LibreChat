import throttle from 'lodash/throttle';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useGetEndpointsQuery, useUserKeyQuery } from 'librechat-data-provider/react-query';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { EModelEndpoint, type TEndpointsConfig } from 'librechat-data-provider';
import type { NavLink } from '~/common';
import { ResizableHandleAlt, ResizablePanel, ResizablePanelGroup } from '~/components/ui/Resizable';
import { TooltipProvider, Tooltip } from '~/components/ui/Tooltip';
import { Blocks, AttachmentIcon } from '~/components/svg';
import { useMediaQuery, useLocalStorage } from '~/hooks';
import { Separator } from '~/components/ui/Separator';
import NavToggle from '~/components/Nav/NavToggle';
import PanelSwitch from './Builder/PanelSwitch';
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
  defaultLayout = [97, 3],
  defaultCollapsed = false,
  navCollapsedSize = 3,
  children,
}: SidePanelProps) {
  const [minSize, setMinSize] = useState(defaultMinSize);
  const [isHovering, setIsHovering] = useState(false);
  const [newUser, setNewUser] = useLocalStorage('newUser', true);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [collapsedSize, setCollapsedSize] = useState(navCollapsedSize);
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  const { data: keyExpiry = { expiresAt: undefined } } = useUserKeyQuery(EModelEndpoint.assistants);
  const isSmallScreen = useMediaQuery('(max-width: 767px)');

  const panelRef = useRef<ImperativePanelHandle>(null);

  const activePanel = localStorage.getItem('side:active-panel');
  const defaultActive = activePanel ? activePanel : undefined;

  const Links = useMemo(() => {
    const links: NavLink[] = [];
    const assistants = endpointsConfig?.[EModelEndpoint.assistants];
    const userProvidesKey = !!assistants?.userProvide;
    const keyProvided = userProvidesKey ? !!keyExpiry?.expiresAt : true;
    if (assistants && assistants.disableBuilder !== true && keyProvided) {
      links.push({
        title: 'com_sidepanel_assistant_builder',
        label: '',
        icon: Blocks,
        id: 'assistants',
        Component: PanelSwitch,
      });
    }

    links.push({
      title: 'com_sidepanel_attach_files',
      label: '',
      icon: AttachmentIcon,
      id: 'files',
      Component: FilesPanel,
    });

    return links;
  }, [endpointsConfig, keyExpiry?.expiresAt]);

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
    if (newUser) {
      setNewUser(false);
    }
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

  const assistants = endpointsConfig?.[EModelEndpoint.assistants];
  const userProvidesKey = !!assistants?.userProvide;
  const keyProvided = userProvidesKey ? !!keyExpiry?.expiresAt : true;

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
              'sidenav border-l border-gray-200 bg-white dark:border-gray-800/50 dark:bg-black',
              isCollapsed ? 'min-w-[50px]' : 'min-w-[340px] sm:min-w-[352px]',
              minSize === 0 ? 'min-w-0' : '',
            )}
          >
            {keyProvided && (
              <div
                className={cn(
                  'sticky left-0 right-0 top-0 z-[100] flex h-[52px] flex-wrap items-center justify-center bg-white dark:bg-black',
                  isCollapsed ? 'h-[52px]' : 'px-2',
                )}
              >
                <Switcher isCollapsed={isCollapsed} />
                <Separator className="bg-gray-100/50" />
              </div>
            )}

            <Nav
              resize={panelRef.current?.resize}
              isCollapsed={isCollapsed}
              defaultActive={defaultActive}
              links={Links}
            />
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
