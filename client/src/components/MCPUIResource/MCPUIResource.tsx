import React, { useMemo } from 'react';
import { UIResourceRenderer } from '@mcp-ui/client';
import type { UIResource } from '~/common';
import { handleUIAction } from '~/utils';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';
import { useMessageContext, useChatContext } from '~/Providers';
import { useGetMessagesByConvoId } from '~/data-provider';
import { useLocalize } from '~/hooks';

interface MCPUIResourceProps {
  node: {
    properties: {
      resourceIndex: number;
    };
  };
}

/**
 * Component that renders an MCP UI resource based on message context and index
 */
export function MCPUIResource(props: MCPUIResourceProps) {
  const { resourceIndex } = props.node.properties;
  const localize = useLocalize();
  const { submitMessage } = useSubmitMessage();
  const { messageId } = useMessageContext();
  const { conversation } = useChatContext();
  const { data: messages } = useGetMessagesByConvoId(conversation?.conversationId ?? '', {
    enabled: !!conversation?.conversationId,
  });

  const uiResource = useMemo(() => {
    const targetMessage = messages?.find((m) => m.messageId === messageId);

    if (!targetMessage?.attachments) {
      return null;
    }

    // Flatten all UI resources across attachments so indices are global
    const allResources: UIResource[] = targetMessage.attachments
      .filter((a) => a.type === 'ui_resources' && a['ui_resources'])
      .flatMap((a) => a['ui_resources'] as UIResource[]);

    return allResources[resourceIndex] ?? null;
  }, [messages, messageId, resourceIndex]);

  if (!uiResource) {
    return (
      <span className="inline-flex items-center rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
        {localize('com_ui_ui_resource_not_found', { 0: resourceIndex.toString() })}
      </span>
    );
  }

  try {
    return (
      <span className="mx-1 inline-block w-full align-middle">
        <UIResourceRenderer
          resource={uiResource}
          onUIAction={async (result) => handleUIAction(result, submitMessage)}
          htmlProps={{
            autoResizeIframe: { width: true, height: true },
          }}
        />
      </span>
    );
  } catch (error) {
    console.error('Error rendering UI resource:', error);
    return (
      <span className="inline-flex items-center rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600">
        {localize('com_ui_ui_resource_error', { 0: uiResource.name })}
      </span>
    );
  }
}
