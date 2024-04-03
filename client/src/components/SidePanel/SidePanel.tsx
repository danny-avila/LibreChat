import throttle from 'lodash/throttle';
import { ArrowRightToLine } from 'lucide-react';
import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
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
  fullPanelCollapse?: boolean;
  children: React.ReactNode;
}

const defaultMinSize = 20;

const SidePanel = ({
  defaultLayout = [97, 3],
  defaultCollapsed = false,
  fullPanelCollapse = false,
  navCollapsedSize = 3,
  children,
}: SidePanelProps) => {
  const [isHovering, setIsHovering] = useState(false);
  const [minSize, setMinSize] = useState(defaultMinSize);
  const [newUser, setNewUser] = useLocalStorage('newUser', true);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [fullCollapse, setFullCollapse] = useState(fullPanelCollapse);
  const [collapsedSize, setCollapsedSize] = useState(navCollapsedSize);
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  const { data: keyExpiry = { expiresAt: undefined } } = useUserKeyQuery(EModelEndpoint.assistants);
  const isSmallScreen = useMediaQuery('(max-width: 767px)');

  const panelRef = useRef<ImperativePanelHandle>(null);

  const defaultActive = useMemo(() => {
    const activePanel = localStorage.getItem('side:active-panel');
    return activePanel ? activePanel : undefined;
  }, []);

  const assistants = useMemo(() => endpointsConfig?.[EModelEndpoint.assistants], [endpointsConfig]);
  const userProvidesKey = useMemo(() => !!assistants?.userProvide, [assistants]);
  const keyProvided = useMemo(
    () => (userProvidesKey ? !!keyExpiry?.expiresAt : true),
    [keyExpiry?.expiresAt, userProvidesKey],
  );

  const Links = useMemo(() => {
    const links: NavLink[] = [];
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

    links.push({
      title: 'com_sidepanel_hide_panel',
      label: '',
      icon: ArrowRightToLine,
      onClick: () => {
        setIsCollapsed(true);
        setCollapsedSize(0);
        setMinSize(defaultMinSize);
        setFullCollapse(true);
        localStorage.setItem('fullPanelCollapse', 'true');
        panelRef.current?.collapse();
      },
      id: 'hide-panel',
    });

    return links;
  }, [assistants, keyProvided]);

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

  const toggleNavVisible = useCallback(() => {
    if (newUser) {
      setNewUser(false);
    }
    setIsCollapsed((prev: boolean) => {
      if (prev) {
        setMinSize(defaultMinSize);
        setCollapsedSize(navCollapsedSize);
        setFullCollapse(false);
        localStorage.setItem('fullPanelCollapse', 'false');
      }
      return !prev;
    });
    if (!isCollapsed) {
      panelRef.current?.collapse();
    } else {
      panelRef.current?.expand();
    }
  }, [isCollapsed, newUser, setNewUser, navCollapsedSize]);

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
                    (isCollapsed && (minSize === 0 || collapsedSize === 0)) || fullCollapse
                      ? 'mr-9'
                      : 'mr-16',
                  )}
                  translateX={false}
                  side="right"
                />
              </div>
            </Tooltip>
          </TooltipProvider>
          {(!isCollapsed || minSize > 0) && !isSmallScreen && !fullCollapse && (
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
              transition: 'width 0.2s ease, visibility 0s linear 0.2s',
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
              'sidenav hide-scrollbar border-l border-gray-200 bg-white transition-opacity dark:border-gray-800/50 dark:bg-gray-850',
              isCollapsed ? 'min-w-[50px]' : 'min-w-[340px] sm:min-w-[352px]',
              (isSmallScreen && isCollapsed && (minSize === 0 || collapsedSize === 0)) ||
                fullCollapse
                ? 'hidden min-w-0'
                : 'opacity-100',
            )}
          >
            {keyProvided && (
              <div
                className={cn(
                  'sticky left-0 right-0 top-0 z-[100] flex h-[52px] flex-wrap items-center justify-center bg-white dark:bg-gray-850',
                  isCollapsed ? 'h-[52px]' : 'px-2',
                )}
              >
                <Switcher isCollapsed={isCollapsed} />
                <Separator className="bg-gray-100/50 dark:bg-gray-600" />
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
            localStorage.setItem('fullPanelCollapse', 'true');
            setFullCollapse(true);
            setCollapsedSize(0);
            setMinSize(0);
            return false;
          });
          panelRef.current?.collapse();
        }}
      />
    </>
  );
};

export default memo(SidePanel);
