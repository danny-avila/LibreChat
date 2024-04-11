import { Content, Portal, Root } from '@radix-ui/react-popover';
import { alternateName, EModelEndpoint } from 'librechat-data-provider';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { FC } from 'react';
import { useChatContext, useAssistantsMapContext } from '~/Providers';
import EndpointItems from './Endpoints/MenuItems';
import TitleButton from './UI/TitleButton';
import { mapEndpoints } from '~/utils';

const EndpointsMenu: FC = () => {
  const { data: endpoints = [] } = useGetEndpointsQuery({
    select: mapEndpoints,
  });

  const { conversation } = useChatContext();
  const { endpoint = '', assistant_id = null } = conversation ?? {};
  const assistantMap = useAssistantsMapContext();

  const assistant = endpoint === EModelEndpoint.assistants && assistantMap?.[assistant_id ?? ''];
  const assistantName = (assistant && assistant?.name) || 'Assistant';

  if (!endpoint) {
    console.warn('No endpoint selected');
    return null;
  }

  const primaryText = assistant ? assistantName : (alternateName[endpoint] ?? endpoint ?? '') + ' ';

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
            className="mt-2 max-h-[65vh] min-w-[340px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-700 dark:text-white lg:max-h-[75vh]"
          >
            <EndpointItems endpoints={endpoints} selected={endpoint} />
          </Content>
        </div>
      </Portal>
    </Root>
  );
};

export default EndpointsMenu;
