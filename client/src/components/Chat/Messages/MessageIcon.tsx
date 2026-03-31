import React, { useMemo, memo } from 'react';
import { getEndpointField } from 'librechat-data-provider';
import type { Assistant, Agent } from 'librechat-data-provider';
import type { TMessageIcon } from '~/common';
import ConvoIconURL from '~/components/Endpoints/ConvoIconURL';
import { useGetEndpointsQuery } from '~/data-provider';
import { getIconEndpoint, logger } from '~/utils';
import Icon from '~/components/Endpoints/Icon';

type MessageIconProps = {
  iconData?: TMessageIcon;
  assistant?: Assistant;
  agent?: Agent;
};

function arePropsEqual(prev: MessageIconProps, next: MessageIconProps): boolean {
  if (prev.iconData !== next.iconData) {
    return false;
  }
  if (prev.agent?.name !== next.agent?.name) {
    return false;
  }
  if (prev.agent?.avatar?.filepath !== next.agent?.avatar?.filepath) {
    return false;
  }
  if (prev.assistant?.name !== next.assistant?.name) {
    return false;
  }
  if (prev.assistant?.metadata?.avatar !== next.assistant?.metadata?.avatar) {
    return false;
  }
  return true;
}

const MessageIcon = memo(({ iconData, assistant, agent }: MessageIconProps) => {
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

  if (iconData?.isCreatedByUser !== true && iconURL != null && iconURL.includes('http')) {
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
}, arePropsEqual);

MessageIcon.displayName = 'MessageIcon';

export default MessageIcon;
