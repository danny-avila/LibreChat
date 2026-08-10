import { useEffect, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppBridge,
  PostMessageTransport,
  buildAllowAttribute,
} from '@modelcontextprotocol/ext-apps/app-bridge';
import type { McpUiStyles, McpUiStyleVariableKey } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { UIResource } from 'librechat-data-provider';
import type { AppToolResult } from '~/utils/mcpApps';
import {
  callMCPAppTool,
  fetchMCPResourceHtml,
  readMCPResource,
  listMCPResources,
  listMCPResourceTemplates,
  getInlineResourceHtml,
  isAllowedAppLink,
  withSandboxCsp,
} from '~/utils/mcpApps';
import { useOptionalMessagesOperations, useIsMessagesViewReadOnly } from '~/Providers';
import { logger } from '~/utils';
import store from '~/store';

type MessageContentBlock = { type?: string; text?: string };

type SizeParams = { width?: number; height?: number };

type ResolvedResource = {
  html: string;
  csp: UIResource['csp'];
  permissions: UIResource['permissions'];
};

export type UseAppBridgeParams = {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  resource: UIResource;
  toolArgs: Record<string, unknown> | undefined;
  toolResult: AppToolResult | undefined;
  onSizeChanged: (params: SizeParams) => void;
  /** False once the app requested teardown, so the effect disposes instead of re-mounting a bridge. */
  active?: boolean;
  onLoaded?: () => void;
  onTeardown?: () => void;
  onFailed?: () => void;
};

/** Maps the MCP Apps standard host style tokens onto LibreChat's theme CSS variables. Apps keep
 * their own fallbacks for anything omitted, so a partial set is intentional. */
const HOST_STYLE_VAR_MAP: Partial<Record<McpUiStyleVariableKey, string>> = {
  '--color-background-primary': '--surface-primary',
  '--color-background-secondary': '--surface-secondary',
  '--color-background-tertiary': '--surface-tertiary',
  '--color-background-danger': '--surface-destructive',
  '--color-text-primary': '--text-primary',
  '--color-text-secondary': '--text-secondary',
  '--color-text-tertiary': '--text-tertiary',
  '--color-text-danger': '--text-destructive',
  '--color-text-warning': '--text-warning',
  '--color-border-primary': '--border-medium',
  '--color-border-secondary': '--border-light',
  '--color-border-danger': '--border-destructive',
};

function readHostTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function buildHostStyleVariables(): McpUiStyles {
  const computed = getComputedStyle(document.documentElement);
  const variables: Partial<Record<McpUiStyleVariableKey, string>> = {};
  for (const [specVar, lcVar] of Object.entries(HOST_STYLE_VAR_MAP)) {
    const value = computed.getPropertyValue(lcVar).trim();
    if (value) {
      variables[specVar as McpUiStyleVariableKey] = value;
    }
  }
  // The token record is optional/partial by design (apps fall back on any we omit); the generated
  // type requires every key, so assert the mapped subset.
  return variables as McpUiStyles;
}

export function useAppBridge({
  iframeRef,
  resource,
  toolArgs,
  toolResult,
  onSizeChanged,
  active = true,
  onLoaded,
  onTeardown,
  onFailed,
}: UseAppBridgeParams) {
  const user = useRecoilValue(store.user);
  const { ask } = useOptionalMessagesOperations();
  // Read-only views (shared transcripts, /search) must not let the embedded app proxy tool calls
  // or resource reads against the viewer's MCP servers with the viewer's auth.
  const readOnly = useIsMessagesViewReadOnly();
  const queryClient = useQueryClient();
  const bridgeRef = useRef<AppBridge | null>(null);
  // The csp actually delivered to the sandbox document, which is what bounds the app's own egress.
  // Host-opened links are authorized against this rather than the tool-result copy, so the host can
  // never open a link the sandbox policy did not grant.
  const effectiveCspRef = useRef<UIResource['csp']>(undefined);
  // The bridge mounts once per resource and reads these only inside its handlers, so a changed
  // callback or tool-call snapshot never tears down the live AppBridge. Synced at render time
  // (idempotent under Strict Mode) rather than via an effect that would only mirror props.
  const askRef = useRef(ask);
  const onSizeChangedRef = useRef(onSizeChanged);
  const onLoadedRef = useRef(onLoaded);
  const onTeardownRef = useRef(onTeardown);
  const onFailedRef = useRef(onFailed);
  const toolArgsRef = useRef(toolArgs);
  const toolResultRef = useRef(toolResult);
  const readOnlyRef = useRef(readOnly);
  askRef.current = ask;
  readOnlyRef.current = readOnly;
  onSizeChangedRef.current = onSizeChanged;
  onLoadedRef.current = onLoaded;
  onTeardownRef.current = onTeardown;
  onFailedRef.current = onFailed;
  toolArgsRef.current = toolArgs;
  toolResultRef.current = toolResult;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !resource.serverName || !active) return;
    const frameWindow = iframe.contentWindow;
    if (!frameWindow) return;

    effectiveCspRef.current = undefined;
    // Unmount, a resource switch, or a teardown can run cleanup while a read or bridge.connect() is
    // still pending; this flag stops the pending continuation from touching a disposed bridge.
    let cancelled = false;
    let resourceSent = false;
    let sendingResource = false;
    let resolved: ResolvedResource | null = null;
    let srcCsp: UIResource['csp'] = undefined;

    const assignSandboxSrc = (csp: UIResource['csp']) => {
      const { url, applied } = withSandboxCsp(iframe.getAttribute('data-sandbox-url') ?? '', csp);
      // srcCsp records what was requested (it guards against reloading the document in a loop);
      // effectiveCspRef records what the sandbox response was actually given.
      srcCsp = csp;
      effectiveCspRef.current = applied;
      if (csp && !applied) {
        logger.warn('[MCP App] Declared csp could not be delivered to the sandbox response');
      }
      iframe.src = url;
    };

    // The WindowProxy identity survives the frame's navigation, so the transport is bound and
    // listening before the sandbox document is even requested: the proxy announces itself as soon as
    // it parses, and an announcement that arrives before the listener exists is a permanent hang.
    const transport = new PostMessageTransport(frameWindow, frameWindow);
    const { locale, timeZone } = Intl.DateTimeFormat().resolvedOptions();
    const bridge = new AppBridge(
      null,
      { name: 'LibreChat', version: '1.0.0' },
      {
        openLinks: {},
        logging: {},
        // Display-only views advertise no host-bound action capabilities so a well-behaved app
        // disables those affordances rather than issuing calls the host ignores.
        ...(!readOnlyRef.current
          ? { serverTools: {}, serverResources: {}, message: { text: {} } }
          : {}),
      },
      {
        hostContext: {
          theme: readHostTheme(),
          platform: 'web',
          locale,
          timeZone,
          displayMode: 'inline',
          availableDisplayModes: ['inline'],
          styles: { variables: buildHostStyleVariables() },
        },
      },
    );

    let lastTheme = readHostTheme();
    const themeObserver = new MutationObserver(() => {
      const nextTheme = readHostTheme();
      if (nextTheme === lastTheme) {
        return;
      }
      lastTheme = nextTheme;
      const activeBridge = bridgeRef.current;
      if (!activeBridge) {
        return;
      }
      Promise.resolve(
        activeBridge.sendHostContextChange({
          theme: nextTheme,
          styles: { variables: buildHostStyleVariables() },
        }),
      ).catch((err: unknown) => logger.error('[MCP App] sendHostContextChange failed', err));
    });

    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      cancelled = true;
      themeObserver.disconnect();
      bridge.close();
      if (bridgeRef.current === bridge) {
        bridgeRef.current = null;
      }
    };

    const interactive = !readOnlyRef.current;

    bridge.onopenlink = async ({ url }) => {
      if (isAllowedAppLink(url, effectiveCspRef.current)) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        logger.warn('[MCP App] Blocked open-link outside the declared egress domains');
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

    const resolveResource = async (): Promise<ResolvedResource | null> => {
      const inlineHtml = getInlineResourceHtml(resource);
      // Inline mcp-app resources already carry their HTML, so use it directly instead of a
      // resources/read round trip; resourceUri-only apps are fetched from the server.
      if (inlineHtml) {
        return { html: inlineHtml, csp: resource.csp, permissions: resource.permissions };
      }
      // Read-only views must not resolve app HTML from the viewer's MCP server.
      if (readOnlyRef.current) {
        logger.debug(
          '[MCP App] Read-only view: skipping server HTML fetch for resourceUri-only app',
        );
        return null;
      }
      const fetched = await queryClient.fetchQuery({
        // The same ui:// URI can carry revised HTML on a later turn, and nothing invalidates this
        // cache entry, so it exists only to collapse concurrent mounts of one resource: query-core
        // returns the in-flight promise while fetchStatus is not idle, and a zero stale time makes
        // every later mount re-read.
        queryKey: [
          QueryKeys.mcpAppResourceHtml,
          resource.serverName,
          resource.uri,
          resource.resourceId,
          user?.id,
        ],
        queryFn: () => fetchMCPResourceHtml(resource.serverName as string, resource.uri),
        staleTime: 0,
      });
      return {
        html: fetched.html,
        csp: (fetched.csp ?? resource.csp) as UIResource['csp'],
        permissions: (fetched.permissions ?? resource.permissions) as UIResource['permissions'],
      };
    };

    const sendResource = async () => {
      if (resourceSent || sendingResource || cancelled) {
        return;
      }
      sendingResource = true;
      try {
        const next = resolved ?? (await resolveResource());
        if (cancelled || !next) {
          return;
        }
        if (!next.html) {
          throw new Error('Resource returned no HTML');
        }
        resolved = next;
        // A retry that resolved a csp the current sandbox document was not served with would run the
        // app under the restrictive default policy; reload the document with the declared domains
        // and let its own announcement deliver the resource.
        if (next.csp && next.csp !== srcCsp) {
          assignSandboxSrc(next.csp);
          return;
        }
        if (next.permissions) {
          const updatedAllow = buildAllowAttribute(
            next.permissions as Parameters<typeof buildAllowAttribute>[0],
          );
          if (updatedAllow) iframe.setAttribute('allow', updatedAllow);
        }
        resourceSent = true;
        await bridge.sendSandboxResourceReady({
          html: next.html,
          csp: next.csp as never,
          permissions: next.permissions as never,
          sandbox: 'allow-scripts allow-forms',
        });
      } catch (err) {
        resourceSent = false;
        logger.error('[MCP App] Failed to send sandbox resource', err);
        if (!cancelled) {
          onFailedRef.current?.();
        }
      } finally {
        sendingResource = false;
      }
    };

    // The proxy re-announces itself until it receives a resource, which is the only retry signal a
    // failed read gets; a latch here strands the frame behind the spinner forever.
    bridge.addEventListener('sandboxready', () => {
      void sendResource();
    });

    bridge.oninitialized = async () => {
      // The app handshake completed: treat this as the load signal so apps that never emit a
      // size-change (auto-resize disabled) are still revealed instead of stuck behind the spinner.
      onLoadedRef.current?.();
      const args = toolArgsRef.current;
      const result = toolResultRef.current;
      // MCP Apps expect tool input exactly once before the result, even for no-argument tools,
      // so apps that initialize from ontoolinput always receive it.
      await bridge
        .sendToolInput({ arguments: args ?? {} })
        .catch((err: unknown) => logger.error('[MCP App] sendToolInput failed', err));
      if (result) {
        await bridge
          .sendToolResult(result as never)
          .catch((err: unknown) => logger.error('[MCP App] sendToolResult failed', err));
      }
    };

    bridge.addEventListener('sizechange', (params) => onSizeChangedRef.current(params));

    bridge.addEventListener('requestteardown', async () => {
      await bridge.teardownResource({}).catch(() => {});
      dispose();
      onTeardownRef.current?.();
    });

    bridge.addEventListener('loggingmessage', (event) => {
      const { level, data } = event as { level: string; data: unknown };
      logger.debug('[MCP App]', level, data);
    });

    const allowAttr = buildAllowAttribute(
      resource.permissions as Parameters<typeof buildAllowAttribute>[0],
    );
    if (allowAttr) iframe.setAttribute('allow', allowAttr);

    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const start = async () => {
      await bridge
        .connect(transport)
        .catch((err: unknown) => logger.error('[MCP App] bridge.connect failed', err));
      if (cancelled) {
        bridge.close();
        return;
      }
      bridgeRef.current = bridge;
      // The sandbox document's CSP comes from the response headers on this URL, so the declared
      // domains have to be resolved before it is requested. apps.mdx:1730 gives the content-level
      // _meta.ui.csp precedence over the tool-level copy, which is only reachable in this order.
      const next = await resolveResource().catch((err: unknown) => {
        logger.error('[MCP App] Failed to read app resource', err);
        onFailedRef.current?.();
        return null;
      });
      if (cancelled) {
        return;
      }
      resolved = next;
      // A failed read still loads the sandbox document: its re-announcements are the only retry
      // signal, and a later resolve reloads it with the declared domains.
      if (next || !readOnlyRef.current) {
        assignSandboxSrc(next?.csp);
      }
    };
    void start();

    return () => {
      bridgeRef.current?.teardownResource({}).catch(() => {});
      dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.resourceId, resource.uri, resource.serverName, active]);
}
