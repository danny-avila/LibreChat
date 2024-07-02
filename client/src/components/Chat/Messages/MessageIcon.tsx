import { useMemo, memo } from 'react';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { TMessage, TPreset, Assistant } from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import ConvoIconURL from '~/components/Endpoints/ConvoIconURL';
import { getEndpointField, getIconEndpoint } from '~/utils';
import Icon from '~/components/Endpoints/Icon';

function MessageIcon(
  props: Pick<TMessageProps, 'message' | 'conversation'> & {
    assistant?: false | Assistant;
  },
) {
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { message, conversation, assistant } = props;

  const assistantName = assistant ? (assistant.name as string | undefined) : '';
  const assistantAvatar = assistant ? (assistant.metadata?.avatar as string | undefined) : '';

  const messageSettings = useMemo(
    () => ({
      ...(conversation ?? {}),
      ...({
        ...message,
        iconURL: message?.iconURL ?? '',
      } as TMessage),
    }),
    [conversation, message],
  );

  const iconURL = messageSettings?.iconURL;
  let endpoint = messageSettings?.endpoint;
  endpoint = getIconEndpoint({ endpointsConfig, iconURL, endpoint });
  const endpointIconURL = getEndpointField(endpointsConfig, endpoint, 'iconURL');

  if (!message?.isCreatedByUser && iconURL && iconURL.includes('http')) {
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
      {...messageSettings}
      endpoint={endpoint}
      iconURL={!assistant ? endpointIconURL : assistantAvatar}
      model={message?.model ?? conversation?.model}
      assistantName={assistantName}
      size={28.8}
    />
  );
}

export default memo(MessageIcon);
