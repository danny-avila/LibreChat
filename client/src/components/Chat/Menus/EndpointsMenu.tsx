import { alternateName } from 'librechat-data-provider';
import { Content, Portal, Root } from '@radix-ui/react-popover';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { FC } from 'react';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
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
      <TitleButton primaryText={primaryText + ' '} />
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
            id="llm-endpoint-menu"
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
