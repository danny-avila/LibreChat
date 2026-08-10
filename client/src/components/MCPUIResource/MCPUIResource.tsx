import React from 'react';
import { useConversationUIResources } from '~/hooks/Messages/useConversationUIResources';
import { useOptionalMessagesConversation } from '~/Providers';
import { useAppBridge, useMCPAppFrame } from '~/hooks/MCP';
import { MCPAppFrame } from './MCPAppFrame';
import { useLocalize } from '~/hooks';
import { logger } from '~/utils';

interface MCPUIResourceProps {
  node: {
    properties: {
      resourceId: string;
    };
  };
}

const EMPTY_RESOURCE = { resourceId: '', uri: '' };
const DEFAULT_HEIGHT = 200;

export function MCPUIResource(props: MCPUIResourceProps) {
  const { resourceId } = props.node.properties;
  const localize = useLocalize();
  const { conversationId } = useOptionalMessagesConversation() ?? {};
  const conversationResourceMap = useConversationUIResources(conversationId ?? undefined);
  const uiResource = conversationResourceMap.get(resourceId ?? '');

  const frame = useMCPAppFrame(uiResource, { defaultHeight: DEFAULT_HEIGHT });

  useAppBridge({
    iframeRef: frame.iframeRef,
    resource: uiResource ?? EMPTY_RESOURCE,
    toolArgs: frame.toolArgs,
    toolResult: frame.toolResult,
    active: frame.active,
    onSizeChanged: frame.onSizeChanged,
    onLoaded: frame.onLoaded,
    onTeardown: frame.onTeardown,
    onFailed: frame.onFailed,
  });

  if (frame.status === 'tornDown') {
    return null;
  }

  if (!uiResource) {
    return (
      <span className="inline-flex items-center rounded bg-surface-tertiary px-2 py-1 text-xs font-medium text-text-secondary">
        {localize('com_ui_ui_resource_not_found', {
          0: resourceId ?? '',
        })}
      </span>
    );
  }

  try {
    if (frame.kind === 'unavailable') {
      return (
        <span className="mx-1 inline-flex w-full items-center gap-2 rounded-lg border border-border-light bg-surface-secondary px-4 py-3 align-middle text-sm text-text-secondary">
          {localize('com_ui_mcp_app_shared_unavailable')}
        </span>
      );
    }
    if (frame.kind === 'app') {
      return (
        <span
          className="relative mx-1 inline-block w-full overflow-hidden align-middle"
          style={{ height: frame.height, minHeight: DEFAULT_HEIGHT }}
        >
          <MCPAppFrame frame={frame} resource={uiResource} />
        </span>
      );
    }

    if (frame.kind === 'static') {
      return (
        <span className="mx-1 inline-block w-full align-middle">
          <iframe
            srcDoc={frame.inlineHtml}
            sandbox=""
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
      <span className="inline-flex items-center rounded bg-status-error-subtle px-2 py-1 text-xs font-medium text-status-error">
        {localize('com_ui_ui_resource_error', { 0: uiResource.name || resourceId })}
      </span>
    );
  }
}
