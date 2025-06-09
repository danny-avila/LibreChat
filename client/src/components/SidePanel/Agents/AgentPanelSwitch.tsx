import { useState, useEffect, useMemo } from 'react';
import { EModelEndpoint, AgentCapabilities } from 'librechat-data-provider';
import type {
  Action,
  TConfig,
  TEndpointsConfig,
  TAgentsEndpoint,
  MCP,
} from 'librechat-data-provider';
import { useGetActionsQuery, useGetEndpointsQuery, useCreateAgentMutation } from '~/data-provider';
import { useChatContext } from '~/Providers';
import ActionsPanel from './ActionsPanel';
import AgentPanel from './AgentPanel';
import VersionPanel from './Version/VersionPanel';
import MCPPanel from './MCPPanel';
import { Panel } from '~/common';
// TODO: Remove this once MCP endpoint is implemented
import {
  AuthTypeEnum,
  AuthorizationTypeEnum,
  TokenExchangeMethodEnum,
} from 'librechat-data-provider';

export default function AgentPanelSwitch() {
  const { conversation, index } = useChatContext();
  const [activePanel, setActivePanel] = useState(Panel.builder);
  const [action, setAction] = useState<Action | undefined>(undefined);
  const [mcp, setMcp] = useState<MCP | undefined>(undefined);
  const [currentAgentId, setCurrentAgentId] = useState<string | undefined>(conversation?.agent_id);
  const { data: actions = [] } = useGetActionsQuery(EModelEndpoint.agents, {
    enabled: !!currentAgentId,
  });
  // TODO: Implement MCP endpoint (currently mocked)
  const { data: mcps = [] } = {
    data: [
      {
        mcp_id: '1',
        agent_id: currentAgentId ?? '',
        metadata: {
          label: 'Gmail',
          domain: 'gmail.googleapis.com',
          auth: {
            type: AuthTypeEnum.OAuth,
            authorization_url: 'https://accounts.google.com/o/oauth2/auth',
            client_url: 'https://oauth2.googleapis.com/token',
            scope: 'https://www.googleapis.com/auth/gmail.send',
            token_exchange_method: TokenExchangeMethodEnum.DefaultPost,
          },
          oauth_client_id: 'your-client-id',
          oauth_client_secret: 'your-client-secret',
          tools: [
            'send_email',
            'create_calendar_event',
            'read_emails',
            'search_emails',
            'create_draft',
            'send_attachment',
            'create_label',
            'move_to_folder',
            'set_auto_reply',
            'get_email_stats',
          ],
        },
      },
      {
        mcp_id: '2',
        agent_id: currentAgentId ?? '',
        metadata: {
          label: 'Pipedream',
          domain: 'api.pipedream.com',
          auth: {
            type: AuthTypeEnum.ServiceHttp,
            authorization_type: AuthorizationTypeEnum.Bearer,
          },
          api_key: 'your-api-key',
          tools: [
            'trigger_workflow',
            'run_workflow',
            'get_workflow_status',
            'list_workflows',
            'create_workflow',
            'update_workflow',
            'delete_workflow',
            'get_workflow_history',
            'get_workflow_logs',
            'get_workflow_stats',
          ],
        },
      },
      {
        mcp_id: '3',
        agent_id: currentAgentId ?? '',
        metadata: {
          label: 'Cloudflare',
          domain: 'api.cloudflare.com',
          auth: {
            type: AuthTypeEnum.ServiceHttp,
            authorization_type: AuthorizationTypeEnum.Bearer,
          },
          api_key: 'your-api-key',
          tools: [
            'get_zone_settings',
            'update_zone_settings',
            'purge_cache',
            'get_analytics',
            'manage_dns_records',
            'manage_workers',
            'manage_rules',
            'get_security_events',
            'manage_ssl_certificates',
            'get_usage_stats',
          ],
        },
      },
    ],
  };
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  const createMutation = useCreateAgentMutation();

  const agentsConfig = useMemo<TAgentsEndpoint | null>(() => {
    const config = endpointsConfig?.[EModelEndpoint.agents] ?? null;
    if (!config) return null;

    return {
      ...(config as TConfig),
      capabilities: Array.isArray(config.capabilities)
        ? config.capabilities.map((cap) => cap as unknown as AgentCapabilities)
        : ([] as AgentCapabilities[]),
    } as TAgentsEndpoint;
  }, [endpointsConfig]);

  useEffect(() => {
    const agent_id = conversation?.agent_id ?? '';
    if (agent_id) {
      setCurrentAgentId(agent_id);
    }
  }, [conversation?.agent_id]);

  if (!conversation?.endpoint) {
    return null;
  }

  const commonProps = {
    index,
    action,
    actions,
    setAction,
    mcp,
    setMcp,
    mcps,
    activePanel,
    setActivePanel,
    setCurrentAgentId,
    agent_id: currentAgentId,
    createMutation,
  };

  if (activePanel === Panel.actions) {
    return <ActionsPanel {...commonProps} />;
  }

  if (activePanel === Panel.version) {
    return (
      <VersionPanel
        setActivePanel={setActivePanel}
        agentsConfig={agentsConfig}
        selectedAgentId={currentAgentId}
      />
    );
  }

  if (activePanel === Panel.mcp) {
    return <MCPPanel {...commonProps} />;
  }

  return (
    <AgentPanel {...commonProps} agentsConfig={agentsConfig} endpointsConfig={endpointsConfig} />
  );
}
