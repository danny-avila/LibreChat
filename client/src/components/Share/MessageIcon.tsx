import { useMemo } from 'react';
import type { TMessage, TPreset, Assistant, Agent } from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import MessageEndpointIcon from '../Endpoints/MessageEndpointIcon';
import ConvoIconURL from '~/components/Endpoints/ConvoIconURL';
import { getIconEndpoint } from '~/utils';
import { UserIcon } from '../svg';

export default function MessageIcon(
  props: Pick<TMessageProps, 'message' | 'conversation'> & {
    assistant?: false | Assistant;
    agent?: false | Agent;
  },
) {
  const { message, conversation, assistant, agent } = props;

  const assistantName = assistant ? (assistant.name as string | undefined) : '';
  const assistantAvatar = assistant ? (assistant.metadata?.avatar as string | undefined) : '';
  const agentName = agent ? (agent.name as string | undefined) : '';
  const agentAvatar = agent ? (agent.metadata?.avatar as string | undefined) : '';

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
  endpoint = getIconEndpoint({ endpointsConfig: undefined, iconURL, endpoint });

  if (!message?.isCreatedByUser && iconURL && iconURL.includes('http')) {
    return (
      <ConvoIconURL
        preset={messageSettings as typeof messageSettings & TPreset}
        context="message"
        assistantAvatar={assistantAvatar}
        assistantName={assistantName}
        agentAvatar={agentAvatar}
        agentName={agentName}
      />
    );
  }

  if (message?.isCreatedByUser) {
    return (
      <div
        style={{
          backgroundColor: 'rgb(121, 137, 255)',
          width: '20px',
          height: '20px',
          boxShadow: 'rgba(240, 246, 252, 0.1) 0px 0px 0px 1px',
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-sm p-1 text-white"
      >
        <UserIcon />
      </div>
    );
  }

  return (
    <MessageEndpointIcon
      {...messageSettings}
      endpoint={endpoint}
      iconURL={!assistant ? undefined : assistantAvatar}
      model={message?.model ?? conversation?.model}
      assistantName={assistantName}
      agentName={agentName}
      size={28.8}
    />
  );
}
