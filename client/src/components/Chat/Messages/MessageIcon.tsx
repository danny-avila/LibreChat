import React, { useMemo, memo } from 'react';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { TMessage, TPreset, Assistant, Agent } from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import ConvoIconURL from '~/components/Endpoints/ConvoIconURL';
import { getEndpointField, getIconEndpoint } from '~/utils';
import Icon from '~/components/Endpoints/Icon';

const MessageIcon = memo(
  (
    props: Pick<TMessageProps, 'message' | 'conversation'> & {
      assistant?: Assistant;
      agent?: Agent;
    },
  ) => {
    const { data: endpointsConfig } = useGetEndpointsQuery();
    const { message, conversation, assistant, agent } = props;

    const assistantName = useMemo(() => assistant?.name ?? '', [assistant]);
    const assistantAvatar = useMemo(() => assistant?.metadata?.avatar ?? '', [assistant]);
    const agentName = useMemo(() => props.agent?.name ?? '', [props.agent]);
    const agentAvatar = useMemo(() => props.agent?.avatar?.filepath ?? '', [props.agent]);
    const isCreatedByUser = useMemo(() => message?.isCreatedByUser ?? false, [message]);

    let avatarURL = '';

    if (assistant) {
      avatarURL = assistantAvatar;
    } else if (agent) {
      avatarURL = agentAvatar;
    }

    const messageSettings = useMemo(
      () => ({
        ...(conversation ?? {}),
        ...({
          ...(message ?? {}),
          iconURL: message?.iconURL ?? '',
        } as TMessage),
      }),
      [conversation, message],
    );

    const iconURL = messageSettings.iconURL;
    const endpoint = useMemo(
      () => getIconEndpoint({ endpointsConfig, iconURL, endpoint: messageSettings.endpoint }),
      [endpointsConfig, iconURL, messageSettings.endpoint],
    );

    const endpointIconURL = useMemo(
      () => getEndpointField(endpointsConfig, endpoint, 'iconURL'),
      [endpointsConfig, endpoint],
    );

    if (isCreatedByUser !== true && iconURL != null && iconURL.includes('http')) {
      return (
        <ConvoIconURL
          preset={messageSettings as typeof messageSettings & TPreset}
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
        isCreatedByUser={isCreatedByUser}
        endpoint={endpoint}
        iconURL={avatarURL || endpointIconURL}
        model={message?.model ?? conversation?.model}
        assistantName={assistantName}
        agentName={agentName}
        size={28.8}
      />
    );
  },
);

MessageIcon.displayName = 'MessageIcon';

export default MessageIcon;
