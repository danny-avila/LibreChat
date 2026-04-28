import React, { useMemo, memo } from 'react';
import { CodeCanBrandIcon } from '@librechat/client';
import type { Assistant, Agent } from 'librechat-data-provider';
import type { TMessageIcon } from '~/common';
import { getEndpointField, getIconEndpoint, logger } from '~/utils';
import ConvoIconURL from '~/components/Endpoints/ConvoIconURL';
import { useGetEndpointsQuery } from '~/data-provider';
import Icon from '~/components/Endpoints/Icon';

const MessageIcon = memo(
  ({
    iconData,
    assistant,
    agent,
  }: {
    iconData?: TMessageIcon;
    assistant?: Assistant;
    agent?: Agent;
  }) => {
    logger.log('icon_data', iconData, assistant, agent);
    const { data: endpointsConfig } = useGetEndpointsQuery();

    const agentName = useMemo(() => agent?.name ?? '', [agent]);
    const agentAvatar = useMemo(() => agent?.avatar?.filepath ?? '', [agent]);
    const assistantName = useMemo(() => assistant?.name ?? '', [assistant]);
    const assistantAvatar = useMemo(() => assistant?.metadata?.avatar ?? '', [assistant]);

    const avatarURL = useMemo(() => {
      let result = '';
      if (assistant) {
        result = assistantAvatar;
      } else if (agent) {
        result = agentAvatar;
      }
      return result;
    }, [assistant, agent, assistantAvatar, agentAvatar]);

    const iconURL = iconData?.iconURL;
    const endpoint = useMemo(
      () => getIconEndpoint({ endpointsConfig, iconURL, endpoint: iconData?.endpoint }),
      [endpointsConfig, iconURL, iconData?.endpoint],
    );

    const endpointIconURL = useMemo(
      () => getEndpointField(endpointsConfig, endpoint, 'iconURL'),
      [endpointsConfig, endpoint],
    );

    const isAssistantMessage = iconData?.isCreatedByUser !== true;
    const hasCustomAvatar = Boolean(avatarURL);

    // For non-user messages with custom assistant/agent avatar, render existing avatar/icon.
    // Otherwise (any assistant reply without a custom avatar), use the CodeCan brand mark — bypass
    // the default URL/Endpoint icon paths which wrap the logo in a circle.
    if (isAssistantMessage && !hasCustomAvatar) {
      return <CodeCanBrandIcon size={28} radius={6} />;
    }

    if (isAssistantMessage && iconURL != null && iconURL.includes('http')) {
      return (
        <ConvoIconURL
          iconURL={iconURL}
          modelLabel={iconData?.modelLabel}
          context="message"
          assistantAvatar={assistantAvatar}
          agentAvatar={agentAvatar}
          endpointIconURL={endpointIconURL}
          assistantName={assistantName}
          agentName={agentName}
        />
      );
    }

    return (
      <Icon
        isCreatedByUser={iconData?.isCreatedByUser ?? false}
        endpoint={endpoint}
        iconURL={avatarURL || endpointIconURL}
        model={iconData?.model}
        assistantName={assistantName}
        agentName={agentName}
        size={28.8}
      />
    );
  },
);

MessageIcon.displayName = 'MessageIcon';

export default MessageIcon;
