import { useContext } from 'react';
import { alternateName, PermissionTypes, Permissions } from 'librechat-data-provider';
import type { ErrorRendererProps } from './parts';
import { ErrorActions, ErrorBody, readString, useErrorEndpoint } from './parts';
import type { TranslationKeys } from '~/hooks';
import { useHasAccess, useLocalize } from '~/hooks';
import { useAgentsMapContext } from '~/Providers';
import { ChatContext } from '~/Providers/ChatContext';

export default function AgentError({ json, message }: ErrorRendererProps) {
  const localize = useLocalize();
  const { provider: endpointProvider } = useErrorEndpoint(message);
  const chat = useContext(ChatContext);
  const agentId = chat?.conversation?.agent_id;
  const agentsMap = useAgentsMapContext();
  const agent = agentId ? agentsMap?.[agentId] : undefined;
  const canCreateAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.CREATE,
  });

  const info = readString(json, 'info');
  const providerName =
    (info != null ? ((alternateName[info] as string | undefined) ?? info) : undefined) ??
    endpointProvider;

  // An absent agent is also the expected state on shared links and search results. Do not claim
  // editability unless the map identifies the agent rendered by this conversation.
  const canEdit = agent != null && agent.isEditable !== false && canCreateAgents;

  const supportName = agent?.support_contact?.name?.trim() ?? '';
  const supportEmail = agent?.support_contact?.email?.trim() ?? '';
  const ownerName = agent?.owner_contact?.name?.trim() ?? '';
  const hasSupportContact = supportName !== '' || supportEmail !== '';
  const contactName = hasSupportContact ? supportName : ownerName;

  const guidanceKey: TranslationKeys = canEdit
    ? 'com_error_invalid_agent_provider_editable'
    : 'com_error_invalid_agent_provider_admin';
  const guidance =
    !canEdit && contactName !== ''
      ? localize('com_error_invalid_agent_provider_owner', { 0: contactName })
      : localize(guidanceKey);

  return (
    <ErrorBody>
      {providerName ? (
        <div>{localize('com_error_invalid_agent_provider', { 0: providerName })}</div>
      ) : null}
      <div>{guidance}</div>
      {supportEmail ? (
        <ErrorActions>
          <a href={`mailto:${supportEmail}`} className="text-link hover:underline">
            {localize('com_error_agent_contact_email', { 0: supportEmail })}
          </a>
        </ErrorActions>
      ) : null}
    </ErrorBody>
  );
}
