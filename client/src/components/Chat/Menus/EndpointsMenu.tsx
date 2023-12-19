import { alternateName } from 'librechat-data-provider';
import { Content, Portal, Root } from '@radix-ui/react-popover';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { FC } from 'react';
import EndpointItems from './Endpoints/MenuItems';
import { useChatContext } from '~/Providers';
import TitleButton from './UI/TitleButton';
import { mapEndpoints } from '~/utils';

const EndpointsMenu: FC = () => {
  const { data: endpoints = [] } = useGetEndpointsQuery({
    select: mapEndpoints,
  });

  const { conversation } = useChatContext();
  const selected = conversation?.endpoint ?? '';

  if (!selected) {
    console.warn('No endpoint selected');
    return null;
  }
  return (
    <Root>
      <TitleButton primaryText={(alternateName[selected] ?? '') + ' '} />
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
            className="mt-2 min-w-[340px] overflow-hidden rounded-lg border border-gray-100 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          >
            <EndpointItems endpoints={endpoints} selected={selected} />
          </Content>
        </div>
      </Portal>
    </Root>
  );
};

export default EndpointsMenu;
