import { useEffect, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import {
  AppBridge,
  PostMessageTransport,
  buildAllowAttribute,
} from '@modelcontextprotocol/ext-apps/app-bridge';
import type { UIResource } from 'librechat-data-provider';
import type { AppToolResult } from '~/utils/mcpApps';
import {
  callMCPAppTool,
  fetchMCPResourceHtml,
  readMCPResource,
  listMCPResources,
} from '~/utils/mcpApps';
import { useOptionalMessagesOperations } from '~/Providers';
import { logger } from '~/utils';
import store from '~/store';

type MessageContentBlock = { type?: string; text?: string };

type SizeParams = { width?: number; height?: number };

export function useAppBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  resource: UIResource,
  toolArgs: Record<string, unknown> | undefined,
  toolResult: AppToolResult | undefined,
  onSizeChanged: (params: SizeParams) => void,
) {
  const user = useRecoilValue(store.user);
  const { ask } = useOptionalMessagesOperations();
  const bridgeRef = useRef<AppBridge | null>(null);
  const askRef = useRef(ask);
  useEffect(() => {
    askRef.current = ask;
  });

  // Refs keep latest values accessible inside the stable effect closure without triggering remount.
  // The bridge mounts once per resourceId; toolArgs/toolResult/onSizeChanged are captured at
  // mount time and are stable for a given resource identity because they derive from the same
  // tool-call snapshot that produced the resource.
  const onSizeChangedRef = useRef(onSizeChanged);
  const toolArgsRef = useRef(toolArgs);
  const toolResultRef = useRef(toolResult);
  useEffect(() => {
    onSizeChangedRef.current = onSizeChanged;
  });
  useEffect(() => {
    toolArgsRef.current = toolArgs;
  });
  useEffect(() => {
    toolResultRef.current = toolResult;
  });

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !resource.serverName) return;

    let bridge: AppBridge | null = null;

    const handleLoad = async () => {
      if (!iframe.contentWindow) return;

      const transport = new PostMessageTransport(iframe.contentWindow, iframe.contentWindow);

      const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      const { locale, timeZone } = Intl.DateTimeFormat().resolvedOptions();

      bridge = new AppBridge(
        null,
        { name: 'LibreChat', version: '1.0.0' },
        {
          openLinks: {},
          serverTools: {},
          serverResources: {},
          logging: {},
          message: { text: {} },
        },
        {
          hostContext: {
            theme,
            platform: 'web',
            locale,
            timeZone,
            displayMode: 'inline',
            availableDisplayModes: ['inline'],
          },
        },
      );

      bridge.oncalltool = async (params) =>
        callMCPAppTool(
          resource.serverName as string,
          params.name,
          (params.arguments as Record<string, unknown>) ?? {},
        ) as never;

      bridge.onopenlink = async ({ url }) => {
        try {
          const { protocol } = new URL(url);
          if (protocol === 'http:' || protocol === 'https:') {
            window.open(url, '_blank', 'noopener,noreferrer');
          } else {
            logger.warn('[MCP App] Blocked open-link with unsupported scheme', protocol);
          }
        } catch {
          logger.warn('[MCP App] Blocked malformed open-link url');
        }
        return {};
      };

      bridge.onreadresource = async (params) =>
        readMCPResource(resource.serverName as string, params.uri, user?.id) as never;

      bridge.onlistresources = async (params) =>
        listMCPResources(resource.serverName as string, params?.cursor) as never;

      bridge.onmessage = async ({ content }) => {
        const text = (content as MessageContentBlock[])
          .filter((block) => block.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text)
          .join('\n');
        if (text) {
          askRef.current({ text });
        }
        return {};
      };

      bridge.addEventListener('sandboxready', async () => {
        try {
          // Inline mcp-app resources already carry their HTML, so use it directly instead of a
          // resources/read round trip; resourceUri-only apps are fetched from the server.
          const { html, csp, permissions } = resource.text
            ? { html: resource.text, csp: resource.csp, permissions: resource.permissions }
            : await fetchMCPResourceHtml(resource.serverName as string, resource.uri, user?.id);
          const resolvedPermissions = permissions ?? resource.permissions;
          if (resolvedPermissions) {
            const updatedAllow = buildAllowAttribute(
              resolvedPermissions as Parameters<typeof buildAllowAttribute>[0],
            );
            if (updatedAllow) iframe.setAttribute('allow', updatedAllow);
          }
          await bridge!.sendSandboxResourceReady({
            html,
            csp: (csp ?? resource.csp) as never,
            permissions: resolvedPermissions as never,
            sandbox: 'allow-scripts allow-forms',
          });
        } catch (err) {
          logger.error('[MCP App] Failed to send sandbox resource', err);
        }
      });

      bridge.oninitialized = async () => {
        const args = toolArgsRef.current;
        const result = toolResultRef.current;
        if (args) {
          await bridge!
            .sendToolInput({ arguments: args })
            .catch((err: unknown) => logger.error('[MCP App] sendToolInput failed', err));
        }
        if (result) {
          await bridge!
            .sendToolResult(result as never)
            .catch((err: unknown) => logger.error('[MCP App] sendToolResult failed', err));
        }
      };

      bridge.addEventListener('sizechange', (params) => onSizeChangedRef.current(params));

      bridge.addEventListener('requestteardown', async () => {
        await bridge!.teardownResource({}).catch(() => {});
      });

      bridge.addEventListener('loggingmessage', (event) => {
        const { level, data } = event as { level: string; data: unknown };
        logger.debug('[MCP App]', level, data);
      });

      await bridge
        .connect(transport)
        .catch((err: unknown) => logger.error('[MCP App] bridge.connect failed', err));
      bridgeRef.current = bridge;
    };

    const allowAttr = buildAllowAttribute(
      resource.permissions as Parameters<typeof buildAllowAttribute>[0],
    );
    if (allowAttr) iframe.setAttribute('allow', allowAttr);
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
