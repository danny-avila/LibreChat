import React, { useMemo, memo } from 'react';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { Assistant, Agent, TMessage } from 'librechat-data-provider';
import ConvoIconURL from '~/components/Endpoints/ConvoIconURL';
import { getEndpointField, getIconEndpoint } from '~/utils';
import Icon from '~/components/Endpoints/Icon';

const MessageIcon = memo(
  (props: {
    iconData?: TMessage & { modelLabel?: string };
    assistant?: Assistant;
    agent?: Agent;
  }) => {
    const { data: endpointsConfig } = useGetEndpointsQuery();
    const { iconData, assistant, agent } = props;

    const assistantName = useMemo(() => assistant?.name ?? '', [assistant]);
    const assistantAvatar = useMemo(() => assistant?.metadata?.avatar ?? '', [assistant]);
    const agentName = useMemo(() => props.agent?.name ?? '', [props.agent]);
    const agentAvatar = useMemo(() => props.agent?.avatar?.filepath ?? '', [props.agent]);

    let avatarURL = '';

    if (assistant) {
      avatarURL = assistantAvatar;
    } else if (agent) {
      avatarURL = agentAvatar;
    }

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
  },
);

MessageIcon.displayName = 'MessageIcon';

export default MessageIcon;
