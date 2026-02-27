import { useMemo } from 'react';
import { MessageSquare } from 'lucide-react';
import { getEndpointField } from 'librechat-data-provider';
import { useUserKeyQuery } from 'librechat-data-provider/react-query';
import type { TEndpointsConfig, TInterfaceConfig } from 'librechat-data-provider';
import type { NavLink } from '~/common';
import useSideNavLinks from '~/hooks/Nav/useSideNavLinks';
import { useGetEndpointsQuery } from '~/data-provider';
import { useSidePanelContext } from '~/Providers';

export default function useUnifiedSidebarLinks({
  interfaceConfig,
  ConversationsComponent,
}: {
  interfaceConfig: Partial<TInterfaceConfig>;
  ConversationsComponent: React.ComponentType;
}) {
  const { endpoint } = useSidePanelContext();
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();

  const endpointType = useMemo(
    () => getEndpointField(endpointsConfig, endpoint, 'type'),
    [endpoint, endpointsConfig],
  );

  const userProvidesKey = useMemo(
    () => !!(endpointsConfig?.[endpoint ?? '']?.userProvide ?? false),
    [endpointsConfig, endpoint],
  );

  const { data: keyExpiry = { expiresAt: undefined } } = useUserKeyQuery(endpoint ?? '');

  const keyProvided = useMemo(
    () => (userProvidesKey ? !!(keyExpiry.expiresAt ?? '') : true),
    [keyExpiry.expiresAt, userProvidesKey],
  );

  const sideNavLinks = useSideNavLinks({
    endpoint,
    hidePanel: () => {},
    keyProvided,
    endpointType,
    interfaceConfig,
    endpointsConfig,
  });

  const links = useMemo(() => {
    const conversationLink: NavLink = {
      title: 'com_ui_chat_history',
      label: '',
      icon: MessageSquare,
      id: 'conversations',
      Component: ConversationsComponent,
    };

    const filtered = sideNavLinks.filter((link) => link.id !== 'hide-panel');
    return [conversationLink, ...filtered];
  }, [sideNavLinks, ConversationsComponent]);

  return links;
}
