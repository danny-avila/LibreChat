import { useCallback, useRef } from 'react';
import { alternateName } from 'librechat-data-provider';
import { Content, Portal, Root } from '@radix-ui/react-popover';
import type { FC, KeyboardEvent } from 'react';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import { useGetEndpointsQuery } from '~/data-provider';
import { mapEndpoints, getEntity } from '~/utils';
import EndpointItems from './Endpoints/MenuItems';
import useLocalize from '~/hooks/useLocalize';
import TitleButton from './UI/TitleButton';

const EndpointsMenu: FC = () => {
  const { data: endpoints = [] } = useGetEndpointsQuery({
    select: mapEndpoints,
  });

  const localize = useLocalize();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const { conversation } = useChatContext();
  const { endpoint = '' } = conversation ?? {};

  const menuRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const menuItems = menuRef.current?.querySelectorAll('[role="option"]');
    if (!menuItems) {
      return;
    }
    if (!menuItems.length) {
      return;
    }

    const currentIndex = Array.from(menuItems).findIndex((item) => item === document.activeElement);

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (currentIndex < menuItems.length - 1) {
          (menuItems[currentIndex + 1] as HTMLElement).focus();
        } else {
          (menuItems[0] as HTMLElement).focus();
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (currentIndex > 0) {
          (menuItems[currentIndex - 1] as HTMLElement).focus();
        } else {
          (menuItems[menuItems.length - 1] as HTMLElement).focus();
        }
        break;
    }
  }, []);

  if (!endpoint) {
    console.warn('No endpoint selected');
    return null;
  }

  const { entity } = getEntity({
    endpoint,
    agentsMap,
    assistantMap,
    agent_id: conversation?.agent_id,
    assistant_id: conversation?.assistant_id,
  });

  const primaryText = entity
    ? entity.name
    : (alternateName[endpoint] as string | undefined) ?? endpoint;

  return (
    <Root>
      <TitleButton primaryText="AICon" />
      <Portal>
        <div
          style={{
            position: 'fixed',
            left: '0px',
            top: '0px',
            transform: 'translate3d(268px, 50px, 0px)',
            minWidth: 'max-content',
            zIndex: 'auto',
          }}
        >
          <Content
            side="bottom"
            align="start"
            role="listbox"
            id="  "
            ref={menuRef}
            onKeyDown={handleKeyDown}
            aria-label={localize('com_ui_endpoints_available')}
            className="mt-2 max-h-[65vh] min-w-[340px] overflow-y-auto rounded-lg border border-border-light bg-header-primary text-text-primary shadow-lg lg:max-h-[75vh]"
          >
            <EndpointItems endpoints={endpoints} selected={endpoint} />
          </Content>
        </div>
      </Portal>
    </Root>
  );
};

export default EndpointsMenu;
