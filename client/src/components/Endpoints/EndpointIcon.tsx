import { getEndpointField, isAssistantsEndpoint } from 'librechat-data-provider';
import type {
  TPreset,
  TConversation,
  TAssistantsMap,
  TEndpointsConfig,
} from 'librechat-data-provider';
import ConvoIconURL from '~/components/Endpoints/ConvoIconURL';
import MinimalIcon from '~/components/Endpoints/MinimalIcon';
import { getIconEndpoint } from '~/utils';

export default function EndpointIcon({
  conversation,
  endpointsConfig,
  className = 'mr-0',
  assistantMap,
  context,
}: {
  conversation: TConversation | TPreset | null;
  endpointsConfig: TEndpointsConfig;
  containerClassName?: string;
  context?: 'message' | 'nav' | 'landing' | 'menu-item';
  assistantMap?: TAssistantsMap;
  className?: string;
  size?: number;
}) {
  const convoIconURL = conversation?.iconURL ?? '';
  let endpoint = conversation?.endpoint;
  endpoint = getIconEndpoint({ endpointsConfig, iconURL: convoIconURL, endpoint });

  const endpointType = getEndpointField(endpointsConfig, endpoint, 'type');
  const endpointIconURL = getEndpointField(endpointsConfig, endpoint, 'iconURL');

  const assistant = isAssistantsEndpoint(endpoint)
    ? assistantMap?.[endpoint]?.[conversation?.assistant_id ?? '']
    : null;
  const assistantAvatar = (assistant && (assistant.metadata?.avatar as string)) || '';
  const assistantName = assistant && (assistant.name ?? '');

  const iconURL = assistantAvatar || convoIconURL;

  if (iconURL && (iconURL.includes('http') || iconURL.startsWith('/images/'))) {
    return (
      <ConvoIconURL
        iconURL={iconURL}
        modelLabel={conversation?.chatGptLabel ?? conversation?.modelLabel ?? ''}
        context={context}
        endpointIconURL={endpointIconURL}
        assistantAvatar={assistantAvatar}
        assistantName={assistantName ?? ''}
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
      />
    );
  }
}
