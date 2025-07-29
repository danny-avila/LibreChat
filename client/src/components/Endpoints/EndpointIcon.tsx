import { isAssistantsEndpoint, isAgentsEndpoint } from 'librechat-data-provider';
import type {
  TConversation,
  TEndpointsConfig,
  TPreset,
  TAssistantsMap,
  TAgentsMap,
} from 'librechat-data-provider';
import ConvoIconURL from '~/components/Endpoints/ConvoIconURL';
import MinimalIcon from '~/components/Endpoints/MinimalIcon';
import { getEndpointField, getIconEndpoint, getEntity } from '~/utils';

export default function EndpointIcon({
  conversation,
  endpointsConfig,
  className = 'mr-0',
  assistantMap,
  agentsMap,
  context,
}: {
  conversation: TConversation | TPreset | null;
  endpointsConfig: TEndpointsConfig;
  containerClassName?: string;
  context?: 'message' | 'nav' | 'landing' | 'menu-item';
  assistantMap?: TAssistantsMap;
  agentsMap?: TAgentsMap;
  className?: string;
  size?: number;
}) {
  const convoIconURL = conversation?.iconURL ?? '';
  let endpoint = conversation?.endpoint;
  endpoint = getIconEndpoint({ endpointsConfig, iconURL: convoIconURL, endpoint });

  const endpointType = getEndpointField(endpointsConfig, endpoint, 'type');
  const endpointIconURL = getEndpointField(endpointsConfig, endpoint, 'iconURL');

  const { entity, isAgent } = getEntity({
    endpoint,
    agentsMap,
    assistantMap,
    agent_id: conversation?.agent_id,
    assistant_id: conversation?.assistant_id,
  });

  const avatar = isAgent
    ? (entity as any)?.avatar?.filepath
    : ((entity as any)?.metadata?.avatar as string);
  const name = entity?.name ?? '';

  const iconURL = avatar || convoIconURL;

  if (iconURL && (iconURL.includes('http') || iconURL.startsWith('/images/'))) {
    return (
      <ConvoIconURL
        iconURL={iconURL}
        modelLabel={conversation?.chatGptLabel ?? conversation?.modelLabel ?? ''}
        context={context}
        endpointIconURL={endpointIconURL}
        assistantAvatar={!isAgent ? avatar : ''}
        assistantName={!isAgent ? name : ''}
        agentAvatar={isAgent ? avatar : ''}
        agentName={isAgent ? name : ''}
      />
    );
  } else {
    return (
      <MinimalIcon
        size={20}
        iconURL={endpointIconURL}
        endpoint={endpoint}
        endpointType={endpointType}
        model={conversation?.model}
        error={false}
        className={className}
        isCreatedByUser={false}
        chatGptLabel={undefined}
        modelLabel={undefined}
        agentName={isAgent ? name : undefined}
      />
    );
  }
}
