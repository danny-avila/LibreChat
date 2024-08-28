import React, { useMemo, memo } from 'react';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { TMessage, TPreset, Assistant } from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import ConvoIconURL from '~/components/Endpoints/ConvoIconURL';
import { getEndpointField, getIconEndpoint } from '~/utils';
import Icon from '~/components/Endpoints/Icon';

const MessageIcon = memo(
  (
    props: Pick<TMessageProps, 'message' | 'conversation'> & {
      assistant?: Assistant;
    },
  ) => {
    const { data: endpointsConfig } = useGetEndpointsQuery();
    const { message, conversation, assistant } = props;

    const assistantName = useMemo(() => assistant?.name ?? '', [assistant]);
    const assistantAvatar = useMemo(() => assistant?.metadata?.avatar ?? '', [assistant]);
    const isCreatedByUser = useMemo(() => message?.isCreatedByUser ?? false, [message]);

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
          endpointIconURL={endpointIconURL}
          assistantName={assistantName}
        />
      );
    }

    return (
      <Icon
        isCreatedByUser={isCreatedByUser}
        endpoint={endpoint}
        iconURL={!assistant ? endpointIconURL : assistantAvatar}
        model={message?.model ?? conversation?.model}
        assistantName={assistantName}
        size={28.8}
      />
    );
  },
);

MessageIcon.displayName = 'MessageIcon';

export default MessageIcon;
