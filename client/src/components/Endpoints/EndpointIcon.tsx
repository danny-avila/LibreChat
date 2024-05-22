import { isAssistantsEndpoint } from 'librechat-data-provider';
import type {
  TConversation,
  TEndpointsConfig,
  TPreset,
  TAssistantsMap,
} from 'librechat-data-provider';
import ConvoIconURL from '~/components/Endpoints/ConvoIconURL';
import MinimalIcon from '~/components/Endpoints/MinimalIcon';
import { getEndpointField, getIconEndpoint } from '~/utils';

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

  const assistant =
    isAssistantsEndpoint(endpoint) && assistantMap?.[endpoint]?.[conversation?.assistant_id ?? ''];
  const assistantAvatar = (assistant && (assistant?.metadata?.avatar as string)) || '';
  const assistantName = (assistant && assistant?.name) || '';

  const iconURL = assistantAvatar || convoIconURL;

  let icon: React.ReactNode | null = null;
  if (iconURL && (iconURL.includes('http') || iconURL.startsWith('/images/'))) {
    icon = ConvoIconURL({
      preset: {
        ...(conversation as TPreset),
        iconURL,
      },
      context,
      endpointIconURL,
      assistantAvatar,
      assistantName,
    });
  } else {
    icon = MinimalIcon({
      size: 20,
      iconURL: endpointIconURL,
      endpoint,
      endpointType,
      model: conversation?.model,
      error: false,
      className,
      isCreatedByUser: false,
      chatGptLabel: undefined,
      modelLabel: undefined,
      jailbreak: undefined,
    });
  }

  return icon;
}
