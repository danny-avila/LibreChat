import { useEffect, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
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
  listMCPResourceTemplates,
} from '~/utils/mcpApps';
import { useOptionalMessagesOperations, useIsMessagesViewReadOnly } from '~/Providers';
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
  onLoaded?: () => void,
  onTeardown?: () => void,
) {
  const user = useRecoilValue(store.user);
  const { ask } = useOptionalMessagesOperations();
  // Read-only views (shared transcripts, /search) must not let the embedded app proxy tool calls
  // or resource reads against the viewer's MCP servers with the viewer's auth.
  const readOnly = useIsMessagesViewReadOnly();
  const queryClient = useQueryClient();
  const bridgeRef = useRef<AppBridge | null>(null);
  // The bridge mounts once per resourceId and reads these only inside its handlers, so a changed
  // callback or tool-call snapshot never tears down the live AppBridge. Synced at render time
  // (idempotent under Strict Mode) rather than via an effect that would only mirror props.
  const askRef = useRef(ask);
  const onSizeChangedRef = useRef(onSizeChanged);
  const onLoadedRef = useRef(onLoaded);
  const onTeardownRef = useRef(onTeardown);
  const toolArgsRef = useRef(toolArgs);
  const toolResultRef = useRef(toolResult);
  const readOnlyRef = useRef(readOnly);
  askRef.current = ask;
  readOnlyRef.current = readOnly;
  onSizeChangedRef.current = onSizeChanged;
  onLoadedRef.current = onLoaded;
  onTeardownRef.current = onTeardown;
  toolArgsRef.current = toolArgs;
  toolResultRef.current = toolResult;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !resource.serverName) return;

    let bridge: AppBridge | null = null;
    // A resourceId switch or unmount can run cleanup while the iframe is still loading or
    // bridge.connect() is pending; this flag stops the stale handleLoad from attaching a second
    // bridge to the same iframe.
    let cancelled = false;
    // The sandbox proxy re-emits `sandbox-proxy-ready` every 500ms until it receives the resource,
    // so fetch and send it only once to avoid overlapping reads and repeated inner-frame creation.
    let sandboxReadyHandled = false;

    const handleLoad = async () => {
      if (!iframe.contentWindow) return;

      const transport = new PostMessageTransport(iframe.contentWindow, iframe.contentWindow);

      const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      const { locale, timeZone } = Intl.DateTimeFormat().resolvedOptions();
      // Display-only views advertise no host-bound action capabilities so a well-behaved app
      // disables those affordances rather than issuing calls the host ignores.
      const interactive = !readOnlyRef.current;

      bridge = new AppBridge(
        null,
        { name: 'LibreChat', version: '1.0.0' },
        {
          openLinks: {},
          logging: {},
          ...(interactive ? { serverTools: {}, serverResources: {}, message: { text: {} } } : {}),
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

      // Host-bound actions (tool calls, resource reads/lists, model messages) run with the viewer's
      // auth, so they are only wired in interactive views, never in shared transcripts or /search.
      if (interactive) {
        bridge.oncalltool = async (params) =>
          callMCPAppTool(
            resource.serverName as string,
            params.name,
            (params.arguments as Record<string, unknown>) ?? {},
          ) as never;

        bridge.onreadresource = async (params) =>
          readMCPResource(resource.serverName as string, params.uri) as never;

        bridge.onlistresources = async (params) =>
          listMCPResources(resource.serverName as string, params?.cursor) as never;

        bridge.onlistresourcetemplates = async (params) =>
          listMCPResourceTemplates(resource.serverName as string, params?.cursor) as never;

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
      }

      bridge.addEventListener('sandboxready', async () => {
        if (sandboxReadyHandled) {
          return;
        }
        sandboxReadyHandled = true;
        // Read-only views must not resolve app HTML from the viewer's MCP server, so only inline
        // (persisted) HTML renders here.
        if (!resource.text && readOnlyRef.current) {
          logger.debug(
            '[MCP App] Read-only view: skipping server HTML fetch for resourceUri-only app',
          );
          return;
        }
        try {
          // Inline mcp-app resources already carry their HTML, so use it directly instead of a
          // resources/read round trip; resourceUri-only apps are fetched from the server.
          const { html, csp, permissions } = resource.text
            ? { html: resource.text, csp: resource.csp, permissions: resource.permissions }
            : await queryClient.fetchQuery({
                queryKey: [
                  QueryKeys.mcpAppResourceHtml,
                  resource.serverName,
                  resource.uri,
                  user?.id,
                ],
                queryFn: () => fetchMCPResourceHtml(resource.serverName as string, resource.uri),
                staleTime: 5 * 60 * 1000,
              });
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
        // The app handshake completed: treat this as the load signal so apps that never emit a
        // size-change (auto-resize disabled) are still revealed instead of stuck behind the spinner.
        onLoadedRef.current?.();
        const args = toolArgsRef.current;
        const result = toolResultRef.current;
        // MCP Apps expect tool input exactly once before the result, even for no-argument tools,
        // so apps that initialize from ontoolinput always receive it.
        await bridge!
          .sendToolInput({ arguments: args ?? {} })
          .catch((err: unknown) => logger.error('[MCP App] sendToolInput failed', err));
        if (result) {
          await bridge!
            .sendToolResult(result as never)
            .catch((err: unknown) => logger.error('[MCP App] sendToolResult failed', err));
        }
      };

      bridge.addEventListener('sizechange', (params) => onSizeChangedRef.current(params));

      bridge.addEventListener('requestteardown', async () => {
        await bridge!.teardownResource({}).catch(() => {});
        onTeardownRef.current?.();
      });

      bridge.addEventListener('loggingmessage', (event) => {
        const { level, data } = event as { level: string; data: unknown };
        logger.debug('[MCP App]', level, data);
      });

      await bridge
        .connect(transport)
        .catch((err: unknown) => logger.error('[MCP App] bridge.connect failed', err));
      if (cancelled) {
        bridge.close();
        return;
      }
      bridgeRef.current = bridge;
    };

    const allowAttr = buildAllowAttribute(
      resource.permissions as Parameters<typeof buildAllowAttribute>[0],
    );
    if (allowAttr) iframe.setAttribute('allow', allowAttr);
    iframe.addEventListener('load', handleLoad, { once: true });
    iframe.src = iframe.getAttribute('data-sandbox-url') ?? '';

    return () => {
      cancelled = true;
      iframe.removeEventListener('load', handleLoad);
      bridgeRef.current?.teardownResource({}).catch(() => {});
      bridgeRef.current?.close();
      bridgeRef.current = null;
      bridge?.close();
      bridge = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.resourceId]);
}
