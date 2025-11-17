import React, { useMemo } from 'react';
import { getEndpointField, SystemRoles, EModelEndpoint } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import { getIconKey, getEntity, getIconEndpoint } from '~/utils';
import ConvoIconURL from '~/components/Endpoints/ConvoIconURL';
import { icons } from '~/hooks/Endpoint/Icons';
import { useAuthContext } from '~/hooks';
import { getHyperAILogo } from '~/utils/getModelIcon';

export default function ConvoIcon({
  conversation,
  endpointsConfig,
  assistantMap,
  agentsMap,
  className = '',
  containerClassName = '',
  context,
  size,
}: {
  conversation: t.TConversation | t.TPreset | null;
  endpointsConfig: t.TEndpointsConfig;
  assistantMap: t.TAssistantsMap | undefined;
  agentsMap: t.TAgentsMap | undefined;
  containerClassName?: string;
  context?: 'message' | 'nav' | 'landing' | 'menu-item';
  className?: string;
  size?: number;
}) {
  const iconURL = conversation?.iconURL ?? '';
  let endpoint = conversation?.endpoint;
  endpoint = getIconEndpoint({ endpointsConfig, iconURL, endpoint });

  const { entity, isAgent } = useMemo(
    () =>
      getEntity({
        endpoint,
        agentsMap,
        assistantMap,
        agent_id: conversation?.agent_id,
        assistant_id: conversation?.assistant_id,
      }),
    [endpoint, conversation?.agent_id, conversation?.assistant_id, agentsMap, assistantMap],
  );

  const name = entity?.name ?? '';
  const avatar = isAgent
    ? (entity as t.Agent | undefined)?.avatar?.filepath
    : ((entity as t.Assistant | undefined)?.metadata?.avatar as string);

  const { user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;
  const endpointIconURL = getEndpointField(endpointsConfig, endpoint, 'iconURL');
  const iconKey = getIconKey({ endpoint, endpointsConfig, endpointIconURL });
  const Icon = icons[iconKey] ?? null;

  // For regular users, replace model provider icons with HyperAI logo
  // Exclude assistants and agents as they have custom avatars
  const shouldUseHyperAILogo = !isAdmin && 
    endpoint !== EModelEndpoint.assistants && 
    endpoint !== EModelEndpoint.azureAssistants && 
    endpoint !== EModelEndpoint.agents &&
    !iconURL.includes('http');

  return (
    <>
      {iconURL && iconURL.includes('http') ? (
        <ConvoIconURL
          iconURL={iconURL}
          modelLabel={conversation?.chatGptLabel ?? conversation?.modelLabel ?? ''}
          endpointIconURL={endpointIconURL}
          assistantAvatar={avatar}
          assistantName={name}
          agentAvatar={avatar}
          agentName={name}
          context={context}
        />
      ) : (
        <div className={containerClassName}>
          {endpoint && Icon != null && (
            shouldUseHyperAILogo ? (
              <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {getHyperAILogo(size ?? 41)}
              </div>
            ) : (
              <Icon
                size={size}
                context={context}
                endpoint={endpoint}
                className={className}
                iconURL={endpointIconURL}
                assistantName={name}
                agentName={name}
                avatar={avatar}
              />
            )
          )}
        </div>
      )}
    </>
  );
}
