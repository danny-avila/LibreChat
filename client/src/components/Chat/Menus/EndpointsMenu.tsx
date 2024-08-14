import { Content, Portal, Root } from '@radix-ui/react-popover';
import { alternateName, isAssistantsEndpoint } from 'librechat-data-provider';
import { useGetEndpointsQuery, useGetStartupConfig } from 'librechat-data-provider/react-query';
import { useEffect, type FC } from 'react';
import { useChatContext, useAssistantsMapContext } from '~/Providers';
import EndpointItems from './Endpoints/MenuItems';
import TitleButton from './UI/TitleButton';
import { mapEndpoints } from '~/utils';

const EndpointsMenu: FC = () => {
  const { data: startupConfig } = useGetStartupConfig({
    cacheTime: 0,
    staleTime: 0,
  });
  const { data: endpoints = [] } = useGetEndpointsQuery({
    select: mapEndpoints,
  });

  const { conversation } = useChatContext();
  const { endpoint = '', assistant_id = null } = conversation ?? {};
  const assistantMap = useAssistantsMapContext();

  const assistant =
    isAssistantsEndpoint(endpoint) && assistantMap?.[endpoint ?? '']?.[assistant_id ?? ''];
  const assistantName = (assistant && assistant?.name) || 'Assistant';

  useEffect(() => {
    const fetchData = async () => {
      const jwt = localStorage.getItem('token');
      try {
        const response = await fetch('/api/config', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('Network response was not ok');
        }

        const data = await response.json();
        localStorage.setItem('userAssistantConfigPermission', data.userAssistantConfigPermission);
      } catch (error) {
        console.error('Error fetching config:', error);
      }
    };

    fetchData();
  }, [startupConfig]);

  if (!endpoint) {
    console.warn('No endpoint selected');
    return null;
  }

  const primaryText = assistant ? assistantName : (alternateName[endpoint] ?? endpoint ?? '') + ' ';

  const handleClick = async () => {
    const jwt = localStorage.getItem('token');
    try {
      const response = await fetch('/api/config', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      localStorage.setItem('userAssistantConfigPermission', data.userAssistantConfigPermission);
    } catch (error) {
      console;
    }
  };

  return (
    <Root>
      <TitleButton primaryText={primaryText + ' '} />
      {
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
            onClick={handleClick}
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
      }
    </Root>
  );
};

export default EndpointsMenu;
