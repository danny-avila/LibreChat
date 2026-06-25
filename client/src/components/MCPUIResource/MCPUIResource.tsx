import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useConversationUIResources } from '~/hooks/Messages/useConversationUIResources';
import { getMCPSandboxUrl, buildAppToolResult, isMcpAppResource } from '~/utils/mcpApps';
import { useOptionalMessagesConversation } from '~/Providers';
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
const SPINNER_TIMEOUT_MS = 10_000;

export function MCPUIResource(props: MCPUIResourceProps) {
  const { resourceId } = props.node.properties;
  const localize = useLocalize();
  const { conversationId } = useOptionalMessagesConversation() ?? {};
  const conversationResourceMap = useConversationUIResources(conversationId ?? undefined);
  const uiResource = conversationResourceMap.get(resourceId ?? '');

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [tornDown, setTornDown] = useState(false);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const sandboxUrl = useMemo(() => getMCPSandboxUrl(), []);

  useEffect(() => {
    if (loaded) {
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), SPINNER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loaded]);

  const toolResult = useMemo(
    () => (uiResource ? buildAppToolResult(uiResource) : undefined),
    [uiResource],
  );

  const handleSizeChanged = useCallback((params: { height?: number; width?: number }) => {
    if (params.height && params.height > 0) {
      setHeight(params.height);
      setLoaded(true);
    }
  }, []);

  useAppBridge(
    iframeRef,
    uiResource ?? EMPTY_RESOURCE,
    uiResource?.toolArgs as Record<string, unknown> | undefined,
    toolResult,
    handleSizeChanged,
    () => setLoaded(true),
    () => setTornDown(true),
  );

  if (tornDown) {
    return null;
  }

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
    if (isMcpAppResource(uiResource)) {
      return (
        <span
          className="relative mx-1 inline-block w-full align-middle"
          style={height ? { height } : { minHeight: '200px' }}
        >
          {!loaded && !timedOut && (
            <div className="absolute inset-0 flex items-center gap-2 rounded-lg border border-border-light bg-surface-secondary px-4 py-3 text-sm text-text-secondary">
              {localize('com_ui_loading_interactive_view')}
            </div>
          )}
          {timedOut && !loaded && (
            <div className="absolute inset-0 flex items-center gap-2 rounded-lg border border-border-light bg-surface-secondary px-4 py-3 text-sm text-text-secondary">
              {localize('com_ui_mcp_app_failed_to_load')}
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
              opacity: loaded ? 1 : 0,
            }}
            title={`MCP App: ${uiResource.toolName ?? ''}`}
          />
        </span>
      );
    }

    if (uiResource.text) {
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
