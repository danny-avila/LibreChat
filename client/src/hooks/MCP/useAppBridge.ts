import { useEffect, useRef } from 'react';
import {
  AppBridge,
  PostMessageTransport,
  buildAllowAttribute,
} from '@modelcontextprotocol/ext-apps/app-bridge';
import type { UIResource } from 'librechat-data-provider';
import { callMCPAppTool, fetchMCPResourceHtml } from '~/utils/mcpApps';
import { logger } from '~/utils';

type SizeParams = { width?: number; height?: number };

export function useAppBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  resource: UIResource,
  toolArgs: Record<string, unknown> | undefined,
  toolResult: { content: []; structuredContent?: Record<string, unknown> } | undefined,
  onSizeChanged: (params: SizeParams) => void,
) {
  const bridgeRef = useRef<AppBridge | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !resource.serverName) return;

    let bridge: AppBridge | null = null;

    const handleLoad = async () => {
      if (!iframe.contentWindow) return;

      const transport = new PostMessageTransport(iframe.contentWindow, iframe.contentWindow);

      bridge = new AppBridge(
        null,
        { name: 'LibreChat', version: '1.0.0' },
        { openLinks: {}, serverTools: {}, logging: {} },
      );

      bridge.oncalltool = async (params) =>
        callMCPAppTool(
          resource.serverName as string,
          params.name,
          (params.arguments as Record<string, unknown>) ?? {},
        ) as never;

      bridge.onopenlink = async ({ url }) => {
        window.open(url, '_blank', 'noopener,noreferrer');
        return {};
      };

      bridge.addEventListener('sandboxready', async () => {
        try {
          const html = await fetchMCPResourceHtml(resource.serverName as string, resource.uri);
          const allowAttr = buildAllowAttribute(
            resource.permissions as Parameters<typeof buildAllowAttribute>[0],
          );
          const sandboxTokens = ['allow-scripts', 'allow-forms'];
          if (allowAttr) sandboxTokens.push(allowAttr);
          await bridge!.sendSandboxResourceReady({
            html,
            csp: resource.csp as never,
            permissions: resource.permissions as never,
            sandbox: sandboxTokens.join(' '),
          });
        } catch (err) {
          logger.error('[MCP App] Failed to send sandbox resource', err);
        }
      });

      bridge.oninitialized = async () => {
        if (toolArgs) {
          await bridge!
            .sendToolInput({ arguments: toolArgs })
            .catch((err: unknown) => logger.error('[MCP App] sendToolInput failed', err));
        }
        if (toolResult) {
          await bridge!
            .sendToolResult(toolResult as never)
            .catch((err: unknown) => logger.error('[MCP App] sendToolResult failed', err));
        }
      };

      bridge.addEventListener('sizechange', onSizeChanged);

      await bridge
        .connect(transport)
        .catch((err: unknown) => logger.error('[MCP App] bridge.connect failed', err));
      bridgeRef.current = bridge;
    };

    iframe.addEventListener('load', handleLoad, { once: true });
    iframe.src = iframe.getAttribute('data-sandbox-url') ?? '';

    return () => {
      bridgeRef.current?.teardownResource({}).catch(() => {});
      bridgeRef.current?.close();
      bridgeRef.current = null;
      bridge = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.resourceId]);
}
