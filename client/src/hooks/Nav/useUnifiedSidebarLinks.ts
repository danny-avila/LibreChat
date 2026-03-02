import { useMemo, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';
import { getEndpointField } from 'librechat-data-provider';
import { useUserKeyQuery } from 'librechat-data-provider/react-query';
import type { TEndpointsConfig, TInterfaceConfig } from 'librechat-data-provider';
import type { NavLink } from '~/common';
import ConversationsSection from '~/components/UnifiedSidebar/ConversationsSection';
import useSideNavLinks from '~/hooks/Nav/useSideNavLinks';
import { useGetEndpointsQuery } from '~/data-provider';
import { useSidePanelContext } from '~/Providers';

export default function useUnifiedSidebarLinks({
  interfaceConfig,
}: {
  interfaceConfig: Partial<TInterfaceConfig>;
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

  const hidePanel = useCallback(() => {}, []);

  const sideNavLinks = useSideNavLinks({
    endpoint,
    hidePanel,
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
      Component: ConversationsSection,
    };

    const filtered = sideNavLinks.filter((link) => link.id !== 'hide-panel');
    return [conversationLink, ...filtered];
  }, [sideNavLinks]);

  return links;
}
