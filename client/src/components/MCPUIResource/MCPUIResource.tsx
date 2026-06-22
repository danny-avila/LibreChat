import React from 'react';
import { AppRenderer } from '@mcp-ui/client';
import { useConversationUIResources } from '~/hooks/Messages/useConversationUIResources';
import { useOptionalMessagesConversation } from '~/Providers';
import { getMCPSandboxConfig } from '~/utils/mcpApps';
import { useMCPAppCallbacks } from '~/hooks/MCP';
import { useLocalize } from '~/hooks';
import { logger } from '~/utils';

interface MCPUIResourceProps {
  node: {
    properties: {
      resourceId: string;
    };
  };
}

export function MCPUIResource(props: MCPUIResourceProps) {
  const { resourceId } = props.node.properties;
  const localize = useLocalize();
  const { conversationId } = useOptionalMessagesConversation();
  const conversationResourceMap = useConversationUIResources(conversationId ?? undefined);
  const uiResource = conversationResourceMap.get(resourceId ?? '');
  const callbacks = useMCPAppCallbacks(uiResource?.serverName ?? '');

  if (!uiResource) {
    return (
      <span className="inline-flex items-center rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
        {localize('com_ui_ui_resource_not_found', {
          0: resourceId ?? '',
        })}
      </span>
    );
  }

  try {
    if (uiResource.toolName && uiResource.serverName && !uiResource.text) {
      return (
        <span className="mx-1 inline-block w-full align-middle">
          <AppRenderer
            toolName={uiResource.toolName}
            sandbox={getMCPSandboxConfig()}
            toolResourceUri={uiResource.uri}
            onCallTool={callbacks.onCallTool}
            onReadResource={callbacks.onReadResource}
            onOpenLink={callbacks.onOpenLink}
            onError={(err) => logger.error('[MCP App]', err)}
          />
        </span>
      );
    }

    if (uiResource.text && (uiResource.mimeType ?? 'text/html').includes('html')) {
      return (
        <span className="mx-1 inline-block w-full align-middle">
          <iframe
            srcDoc={uiResource.text}
            sandbox="allow-scripts allow-forms"
            style={{ width: '100%', minHeight: '200px', border: 'none' }}
            title={uiResource.uri}
          />
        </span>
      );
    }

    return null;
  } catch (error) {
    logger.error('[MCPUIResource]', error);
    return (
      <span className="inline-flex items-center rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600">
        {localize('com_ui_ui_resource_error', { 0: uiResource.name || resourceId })}
      </span>
    );
  }
}
