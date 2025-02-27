import { useState, useCallback, useMemo, memo } from 'react';
import { useUserKeyQuery } from 'librechat-data-provider/react-query';
import type { TEndpointsConfig, TInterfaceConfig } from 'librechat-data-provider';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { ResizableHandleAlt, ResizablePanel } from '~/components/ui/Resizable';
import { useMediaQuery, useLocalStorage, useLocalize } from '~/hooks';
import useSideNavLinks from '~/hooks/Nav/useSideNavLinks';
import { useGetEndpointsQuery } from '~/data-provider';
import NavToggle from '~/components/Nav/NavToggle';
import { cn, getEndpointField } from '~/utils';
import { useChatContext } from '~/Providers';
import Switcher from './Switcher';
import Nav from './Nav';
import { useAuthContext } from '~/hooks/AuthContext';
import showdown from 'showdown';
import { SaveAllIcon } from 'lucide-react';

const defaultMinSize = 20;

const SidePanel = ({
  defaultSize,
  panelRef,
  navCollapsedSize = 3,
  hasArtifacts,
  minSize,
  setMinSize,
  collapsedSize,
  setCollapsedSize,
  isCollapsed,
  setIsCollapsed,
  fullCollapse,
  setFullCollapse,
  interfaceConfig,
}: {
  defaultSize?: number;
  hasArtifacts: boolean;
  navCollapsedSize?: number;
  minSize: number;
  setMinSize: React.Dispatch<React.SetStateAction<number>>;
  collapsedSize: number;
  setCollapsedSize: React.Dispatch<React.SetStateAction<number>>;
  isCollapsed: boolean;
  setIsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  fullCollapse: boolean;
  setFullCollapse: React.Dispatch<React.SetStateAction<boolean>>;
  panelRef: React.RefObject<ImperativePanelHandle>;
  interfaceConfig: TInterfaceConfig;
}) => {
  const localize = useLocalize();
  const [isHovering, setIsHovering] = useState(false);
  const [newUser, setNewUser] = useLocalStorage('newUser', true);
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();

  const { user } = useAuthContext();

  const isSmallScreen = useMediaQuery('(max-width: 767px)');
  const { conversation, getMessages } = useChatContext();
  const { endpoint } = conversation ?? {};
  const { data: keyExpiry = { expiresAt: undefined } } = useUserKeyQuery(endpoint ?? '');

  const defaultActive = useMemo(() => {
    const activePanel = localStorage.getItem('side:active-panel');
    return typeof activePanel === 'string' ? activePanel : undefined;
  }, []);

  const endpointType = useMemo(
    () => getEndpointField(endpointsConfig, endpoint, 'type'),
    [endpoint, endpointsConfig],
  );
  const assistants = useMemo(() => endpointsConfig?.[endpoint ?? ''], [endpoint, endpointsConfig]);
  const agents = useMemo(() => endpointsConfig?.[endpoint ?? ''], [endpoint, endpointsConfig]);

  const userProvidesKey = useMemo(
    () => !!(endpointsConfig?.[endpoint ?? '']?.userProvide ?? false),
    [endpointsConfig, endpoint],
  );
  const keyProvided = useMemo(
    () => (userProvidesKey ? !!(keyExpiry.expiresAt ?? '') : true),
    [keyExpiry.expiresAt, userProvidesKey],
  );

  const hidePanel = useCallback(() => {
    setIsCollapsed(true);
    setCollapsedSize(0);
    setMinSize(defaultMinSize);
    setFullCollapse(true);
    localStorage.setItem('fullPanelCollapse', 'true');
    panelRef.current?.collapse();
  }, []);

  const Links = useSideNavLinks({
    agents,
    endpoint,
    hidePanel,
    assistants,
    keyProvided,
    endpointType,
    interfaceConfig,
    customLinks: [
      {
        id: 'custom-settings',
        title: 'com_ui_custom_settings', // localizeKey
        icon: SaveAllIcon,
        onClick: async () => {
          const messages = getMessages();

          const converter = new showdown.Converter();

          const html = messages?.map((message) => message.isCreatedByUser ?
            `
            <div style="margin-bottom: 10px;">
                <div style="background-color: #e0e0e0; padding: 10px; border-radius: 8px; max-width: 80%;">
                    <strong>${user?.username}</strong>
                    <p>${converter.makeHtml(message.text)}</p>
                </div>
            </div>
            ` : `
            <div style="margin-bottom: 10px;">
                <div style="background-color: #007bff; color: #fff; padding: 10px; border-radius: 8px; max-width: 80%; margin-left: auto;">
                     <div style="text-align: right;">
                        <strong>InsuraiBot_${message.sender}</strong>              
                    </div>
                    <p>${converter.makeHtml(message.text)}</p>
                </div>
            </div>
            `).join('');

          const final = `
              <div><div style="flex: 1; padding: 10px;">${html}</div></div>
            `;
          const response = await fetch('https://aizpun.autarc-ai.de/api/Insurai/chat/save', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'key': '5ff586e432a1efdfab77b0e19ad7d211834ec61402ef93c9856945e4d02780d3',
              'license': '05688',
            },
            body: JSON.stringify({
              conversationId: conversation?.conversationId,
              content: final,
            }),
          });

          if(response.ok) {
            alert('Erfolgreich gespeichert');
          }else {
            alert('Fehler beim Speichern');
          }
        },
      },
    ]
  });

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
      {(!isCollapsed || minSize > 0) && !isSmallScreen && !fullCollapse && (
        <ResizableHandleAlt withHandle className="bg-transparent text-text-primary" />
      )}
      <ResizablePanel
        tagName="nav"
        id="controls-nav"
        order={hasArtifacts != null ? 3 : 2}
        aria-label={localize('com_ui_controls')}
        role="navigation"
        collapsedSize={collapsedSize}
        defaultSize={defaultSize}
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
          'sidenav hide-scrollbar border-l border-border-light bg-background transition-opacity',
          isCollapsed ? 'min-w-[50px]' : 'min-w-[340px] sm:min-w-[352px]',
          (isSmallScreen && isCollapsed && (minSize === 0 || collapsedSize === 0)) || fullCollapse
            ? 'hidden min-w-0'
            : 'opacity-100',
        )}
      >
        {interfaceConfig.modelSelect === true && (
          <div
            className={cn(
              'sticky left-0 right-0 top-0 z-[100] flex h-[52px] flex-wrap items-center justify-center bg-background',
              isCollapsed ? 'h-[52px]' : 'px-2',
            )}
          >
            <Switcher
              isCollapsed={isCollapsed}
              endpointKeyProvided={keyProvided}
              endpoint={endpoint}
            />
          </div>
        )}
        <Nav
          resize={panelRef.current?.resize}
          isCollapsed={isCollapsed}
          defaultActive={defaultActive}
          links={Links}
        />
      </ResizablePanel>
    </>
  );
};

export default memo(SidePanel);
