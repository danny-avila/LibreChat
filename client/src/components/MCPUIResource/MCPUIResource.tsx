import React, { useRef, useState, useMemo, useCallback } from 'react';
import { useConversationUIResources } from '~/hooks/Messages/useConversationUIResources';
import { useOptionalMessagesConversation } from '~/Providers';
import { getMCPSandboxUrl } from '~/utils/mcpApps';
import { useAppBridge } from '~/hooks/MCP';
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

export function MCPUIResource(props: MCPUIResourceProps) {
  const { resourceId } = props.node.properties;
  const localize = useLocalize();
  const { conversationId } = useOptionalMessagesConversation() ?? {};
  const conversationResourceMap = useConversationUIResources(conversationId ?? undefined);
  const uiResource = conversationResourceMap.get(resourceId ?? '');

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const sandboxUrl = useMemo(() => getMCPSandboxUrl(), []);

  const toolResult = useMemo(() => {
    const sc = uiResource?.structuredContent as Record<string, unknown> | undefined | null;
    const content = (uiResource?.content as [] | undefined) ?? [];
    if ((!sc || typeof sc !== 'object' || Array.isArray(sc)) && content.length === 0)
      return undefined;
    return {
      content,
      ...(sc && typeof sc === 'object' && !Array.isArray(sc) ? { structuredContent: sc } : {}),
    };
  }, [uiResource?.structuredContent, uiResource?.content]);

  const handleSizeChanged = useCallback((params: { height?: number; width?: number }) => {
    if (params.height && params.height > 0) {
      setHeight(params.height);
      setLoaded(true);
    }
  }, []);

  useAppBridge(iframeRef, uiResource ?? EMPTY_RESOURCE, undefined, toolResult, handleSizeChanged);

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
        <span
          className="mx-1 inline-block w-full align-middle"
          style={height ? { height } : { minHeight: '200px' }}
        >
          {!loaded && (
            <div className="flex items-center gap-2 rounded-lg border border-border-light bg-surface-secondary px-4 py-3 text-sm text-text-secondary">
              {localize('com_ui_loading_interactive_view')}
            </div>
          )}
          <iframe
            ref={iframeRef}
            data-sandbox-url={sandboxUrl}
            sandbox="allow-scripts allow-forms"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: loaded ? 'block' : 'none',
            }}
            title={`MCP App: ${(uiResource.toolName as string | undefined) ?? ''}`}
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
