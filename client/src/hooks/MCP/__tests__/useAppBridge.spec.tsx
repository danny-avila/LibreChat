import React from 'react';
import { RecoilRoot } from 'recoil';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UIResource } from 'librechat-data-provider';
import {
  callMCPAppTool,
  fetchMCPResourceHtml,
  listMCPResources,
  listMCPResourceTemplates,
  readMCPResource,
} from '~/utils/mcpApps';
import { useAppBridge } from '~/hooks/MCP/useAppBridge';
import { useIsMessagesViewReadOnly } from '~/Providers';

type Listener = (params: unknown) => void;
const requestExtra = () => ({ signal: new AbortController().signal });
type RequestHandler = (
  params: Record<string, unknown>,
  extra: ReturnType<typeof requestExtra>,
) => Promise<unknown>;
const mockAsk = jest.fn();

class FakeAppBridge {
  static instances: FakeAppBridge[] = [];

  capabilities: Record<string, unknown>;
  listeners = new Map<string, Listener[]>();
  connected: unknown = null;
  closed = false;
  resourceReady: Array<Record<string, unknown>> = [];
  toolInput: unknown[] = [];
  toolResults: unknown[] = [];
  hostContextChanges: unknown[] = [];
  teardowns = 0;
  onopenlink?: (
    params: { url: string },
    extra: ReturnType<typeof requestExtra>,
  ) => Promise<unknown>;

  oninitialized?: () => Promise<void>;
  oncalltool?: RequestHandler;
  onreadresource?: RequestHandler;
  onlistresources?: RequestHandler;
  onlistresourcetemplates?: RequestHandler;
  onmessage?: RequestHandler;

  constructor(
    _transport: unknown,
    _info: unknown,
    capabilities: Record<string, unknown>,
    _options: unknown,
  ) {
    this.capabilities = capabilities;
    FakeAppBridge.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    const bucket = this.listeners.get(type) ?? [];
    bucket.push(listener);
    this.listeners.set(type, bucket);
  }

  emit(type: string, params: unknown = {}) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(params);
    }
  }

  async connect(transport: unknown) {
    this.connected = transport;
  }

  close() {
    this.closed = true;
  }

  async sendSandboxResourceReady(params: Record<string, unknown>) {
    this.resourceReady.push(params);
  }

  async sendToolInput(params: unknown) {
    this.toolInput.push(params);
  }

  async sendToolResult(params: unknown) {
    this.toolResults.push(params);
  }

  async sendHostContextChange(params: unknown) {
    this.hostContextChanges.push(params);
  }

  async teardownResource() {
    this.teardowns += 1;
    return {};
  }
}

jest.mock('@modelcontextprotocol/ext-apps/app-bridge', () => ({
  AppBridge: jest.fn(),
  PostMessageTransport: jest.fn().mockImplementation((post: unknown, listen: unknown) => ({
    post,
    listen,
  })),
  buildAllowAttribute: () => '',
}));

jest.mock('~/utils/mcpApps', () => ({
  ...jest.requireActual('~/utils/mcpApps'),
  fetchMCPResourceHtml: jest.fn(),
  callMCPAppTool: jest.fn(),
  readMCPResource: jest.fn(),
  listMCPResources: jest.fn(),
  listMCPResourceTemplates: jest.fn(),
}));

jest.mock('~/Providers', () => ({
  useOptionalMessagesOperations: () => ({ ask: mockAsk }),
  useIsMessagesViewReadOnly: jest.fn(() => false),
}));

const { AppBridge } = jest.requireMock('@modelcontextprotocol/ext-apps/app-bridge') as {
  AppBridge: jest.Mock;
};
const mockFetchHtml = fetchMCPResourceHtml as jest.MockedFunction<typeof fetchMCPResourceHtml>;
const mockCallTool = callMCPAppTool as jest.MockedFunction<typeof callMCPAppTool>;
const mockReadResource = readMCPResource as jest.MockedFunction<typeof readMCPResource>;
const mockListResources = listMCPResources as jest.MockedFunction<typeof listMCPResources>;
const mockListTemplates = listMCPResourceTemplates as jest.MockedFunction<
  typeof listMCPResourceTemplates
>;
const mockReadOnly = useIsMessagesViewReadOnly as jest.MockedFunction<
  typeof useIsMessagesViewReadOnly
>;

const SANDBOX_URL =
  'http://localhost:3080/api/mcp/sandbox?parentOrigin=http%3A%2F%2Flocalhost%3A3080';

const makeResource = (overrides: Partial<UIResource> = {}): UIResource =>
  ({
    resourceId: 'r1',
    uri: 'ui://app/main',
    mimeType: 'text/html;profile=mcp-app',
    toolName: 'render',
    serverName: 'demo',
    ...overrides,
  }) as UIResource;

function mountBridge(
  resource: UIResource,
  client: QueryClient,
  callbacks: { onTeardown?: () => void } = {},
) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-sandbox-url', SANDBOX_URL);
  document.body.appendChild(iframe);
  const iframeRef = { current: iframe };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </RecoilRoot>
  );
  const view = renderHook(
    () =>
      useAppBridge({
        iframeRef,
        resource,
        toolArgs: { q: 1 },
        toolResult: { content: [] },
        onSizeChanged: jest.fn(),
        onLoaded: jest.fn(),
        onTeardown: callbacks.onTeardown ?? jest.fn(),
        onFailed: jest.fn(),
      }),
    { wrapper },
  );
  return { iframe, view };
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const latest = () => FakeAppBridge.instances[FakeAppBridge.instances.length - 1];

describe('useAppBridge', () => {
  let client: QueryClient;

  beforeEach(() => {
    FakeAppBridge.instances = [];
    AppBridge.mockImplementation(
      (t: unknown, i: unknown, c: Record<string, unknown>, o: unknown) =>
        new FakeAppBridge(t, i, c, o),
    );
    mockReadOnly.mockReturnValue(false);
    mockAsk.mockReset();
    mockFetchHtml.mockResolvedValue({ html: '<p>app</p>' });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    document.body.innerHTML = '';
    document.documentElement.className = '';
  });

  describe('ordering', () => {
    it('connects the transport before the sandbox document is requested', async () => {
      let resolveHtml: (value: { html: string }) => void = () => {};
      mockFetchHtml.mockReturnValue(
        new Promise((resolve) => {
          resolveHtml = resolve;
        }) as ReturnType<typeof fetchMCPResourceHtml>,
      );
      const { iframe } = mountBridge(makeResource(), client);
      await flush();

      expect(latest().connected).not.toBeNull();
      expect(iframe.getAttribute('src')).toBeNull();

      await act(async () => {
        resolveHtml({ html: '<p>app</p>' });
        await Promise.resolve();
      });
      await flush();
      expect(iframe.src).toContain('/api/mcp/sandbox');
    });

    it('carries the resolved csp to the sandbox response boundary', async () => {
      mockFetchHtml.mockResolvedValue({
        html: '<p>app</p>',
        csp: { connectDomains: ['https://api.example.com'] },
      });
      const { iframe } = mountBridge(makeResource(), client);
      await flush();

      const csp = new URL(iframe.src).searchParams.get('csp');
      expect(JSON.parse(csp as string)).toEqual({ connectDomains: ['https://api.example.com'] });
    });

    it('sends the resource once even when the proxy announces twice', async () => {
      mountBridge(makeResource(), client);
      await flush();

      await act(async () => {
        latest().emit('sandboxready');
        latest().emit('sandboxready');
      });
      await flush();
      expect(latest().resourceReady).toHaveLength(1);
      expect(latest().resourceReady[0].html).toBe('<p>app</p>');
    });

    it('attaches no bridge and no src when cancelled mid-fetch', async () => {
      let resolveHtml: (value: { html: string }) => void = () => {};
      mockFetchHtml.mockReturnValue(
        new Promise((resolve) => {
          resolveHtml = resolve;
        }) as ReturnType<typeof fetchMCPResourceHtml>,
      );
      const { iframe, view } = mountBridge(makeResource(), client);
      await flush();
      const requestSignal = mockFetchHtml.mock.calls[0][2];
      act(() => view.unmount());
      await flush();

      expect(requestSignal?.aborted).toBe(true);
      await act(async () => {
        resolveHtml({ html: '<p>app</p>' });
        await Promise.resolve();
      });
      expect(iframe.getAttribute('src')).toBeNull();
      expect(latest().closed).toBe(true);
    });
  });

  describe('refetching changed html (3745939818)', () => {
    it('reads again on a later mount instead of serving a stale document', async () => {
      mockFetchHtml.mockResolvedValueOnce({ html: '<p>v1</p>' });
      const first = mountBridge(makeResource(), client);
      await flush();
      await act(async () => latest().emit('sandboxready'));
      await flush();
      expect(latest().resourceReady[0].html).toBe('<p>v1</p>');
      first.view.unmount();

      mockFetchHtml.mockResolvedValueOnce({ html: '<p>v2</p>' });
      mountBridge(makeResource(), client);
      await flush();
      await act(async () => latest().emit('sandboxready'));
      await flush();

      expect(mockFetchHtml).toHaveBeenCalledTimes(2);
      expect(latest().resourceReady[0].html).toBe('<p>v2</p>');
    });

    it('cancels only the leaving View when peers read the same resource', async () => {
      const requests: Array<{
        signal?: AbortSignal;
        resolve: (value: { html: string }) => void;
      }> = [];
      mockFetchHtml.mockImplementation(
        (_server, _uri, signal) =>
          new Promise((resolve) => requests.push({ signal, resolve })) as ReturnType<
            typeof fetchMCPResourceHtml
          >,
      );
      const first = mountBridge(makeResource(), client);
      const second = mountBridge(makeResource(), client);
      await flush();
      expect(requests).toHaveLength(2);

      act(() => first.view.unmount());
      await flush();
      expect(requests[0].signal?.aborted).toBe(true);
      expect(requests[1].signal?.aborted).toBe(false);

      await act(async () => requests[1].resolve({ html: '<p>peer survives</p>' }));
      await flush();
      expect(second.iframe.src).toContain('/api/mcp/sandbox');
    });

    it('does not report an old read failure into a replacement View', async () => {
      let rejectFirst: (reason: Error) => void = () => {};
      mockFetchHtml
        .mockImplementationOnce(
          () =>
            new Promise((_resolve, reject) => {
              rejectFirst = reject;
            }) as ReturnType<typeof fetchMCPResourceHtml>,
        )
        .mockResolvedValueOnce({ html: '<p>replacement</p>' });
      const iframe = document.createElement('iframe');
      iframe.setAttribute('data-sandbox-url', SANDBOX_URL);
      document.body.appendChild(iframe);
      const firstFailed = jest.fn();
      const replacementFailed = jest.fn();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <RecoilRoot>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </RecoilRoot>
      );
      const view = renderHook(
        ({ resource, onFailed }: { resource: UIResource; onFailed: () => void }) =>
          useAppBridge({
            iframeRef: { current: iframe },
            resource,
            toolArgs: undefined,
            toolResult: undefined,
            onSizeChanged: jest.fn(),
            onFailed,
          }),
        {
          wrapper,
          initialProps: { resource: makeResource(), onFailed: firstFailed },
        },
      );
      await flush();

      view.rerender({
        resource: makeResource({ resourceId: 'r2', uri: 'ui://app/replacement' }),
        onFailed: replacementFailed,
      });
      await flush();
      rejectFirst(new Error('old read failed'));
      await flush();

      expect(firstFailed).not.toHaveBeenCalled();
      expect(replacementFailed).not.toHaveBeenCalled();
      expect(iframe.src).toContain('/api/mcp/sandbox');
    });
  });

  describe('failure handling', () => {
    it('retries on the next proxy announcement instead of latching', async () => {
      mockFetchHtml.mockRejectedValueOnce(new Error('boom'));
      mountBridge(makeResource(), client);
      await flush();
      expect(latest().resourceReady).toHaveLength(0);

      mockFetchHtml.mockResolvedValueOnce({ html: '<p>after retry</p>' });
      await act(async () => latest().emit('sandboxready'));
      await flush();
      await act(async () => latest().emit('sandboxready'));
      await flush();

      expect(latest().resourceReady).toHaveLength(1);
      expect(latest().resourceReady[0].html).toBe('<p>after retry</p>');
    });

    it('treats empty html as a failure', async () => {
      mockFetchHtml.mockResolvedValue({ html: '' });
      const onFailed = jest.fn();
      const iframe = document.createElement('iframe');
      iframe.setAttribute('data-sandbox-url', SANDBOX_URL);
      document.body.appendChild(iframe);
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <RecoilRoot>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </RecoilRoot>
      );
      renderHook(
        () =>
          useAppBridge({
            iframeRef: { current: iframe },
            resource: makeResource(),
            toolArgs: undefined,
            toolResult: undefined,
            onSizeChanged: jest.fn(),
            onFailed,
          }),
        { wrapper },
      );
      await flush();
      await act(async () => latest().emit('sandboxready'));
      await flush();

      expect(latest().resourceReady).toHaveLength(0);
      expect(onFailed).toHaveBeenCalled();
    });
  });

  describe('read-only views', () => {
    it('never resolves app html from the viewer server for a resourceUri-only app', async () => {
      mockReadOnly.mockReturnValue(true);
      const { iframe } = mountBridge(makeResource(), client);
      await flush();
      await act(async () => latest().emit('sandboxready'));
      await flush();

      expect(mockFetchHtml).not.toHaveBeenCalled();
      expect(iframe.getAttribute('src')).toBeNull();
      expect(latest().resourceReady).toHaveLength(0);
    });

    it('runs inline html with no host-bound capabilities', async () => {
      mockReadOnly.mockReturnValue(true);
      mountBridge(makeResource({ text: '<p>inline</p>' }), client);
      await flush();
      await act(async () => latest().emit('sandboxready'));
      await flush();

      expect(mockFetchHtml).not.toHaveBeenCalled();
      expect(latest().resourceReady[0].html).toBe('<p>inline</p>');
      expect(latest().capabilities.serverTools).toBeUndefined();
      expect(latest().capabilities.openLinks).toEqual({});
    });
  });

  describe('openLink authorization', () => {
    let openSpy: jest.SpyInstance;

    beforeEach(() => {
      openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    });

    it('denies a link before the sandbox document has any policy', async () => {
      let resolveHtml: (value: { html: string }) => void = () => {};
      mockFetchHtml.mockReturnValue(
        new Promise((resolve) => {
          resolveHtml = resolve;
        }) as ReturnType<typeof fetchMCPResourceHtml>,
      );
      mountBridge(
        makeResource({
          csp: { connectDomains: ['https://api.example.com'] },
        } as Partial<UIResource>),
        client,
      );
      await flush();

      await act(async () => {
        await latest().onopenlink?.({ url: 'https://api.example.com/x' }, requestExtra());
      });
      expect(openSpy).not.toHaveBeenCalled();
      await act(async () => {
        resolveHtml({ html: '<p>app</p>' });
        await Promise.resolve();
      });
    });

    it('refuses a link the tool-result copy grants but the delivered policy does not', async () => {
      mockFetchHtml.mockResolvedValue({
        html: '<p>app</p>',
        csp: { connectDomains: ['https://other.example'] },
      });
      mountBridge(
        makeResource({
          csp: { connectDomains: ['https://api.example.com'] },
        } as Partial<UIResource>),
        client,
      );
      await flush();

      let result: unknown;
      await act(async () => {
        result = await latest().onopenlink?.({ url: 'https://api.example.com/x' }, requestExtra());
      });
      expect(result).toEqual({ isError: true });
      expect(openSpy).not.toHaveBeenCalled();

      await act(async () => {
        result = await latest().onopenlink?.({ url: 'https://other.example/x' }, requestExtra());
      });
      expect(result).toEqual({});
      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(openSpy).toHaveBeenCalledWith(
        'https://other.example/x',
        '_blank',
        'noopener,noreferrer',
      );
    });

    it('uses the same capped declaration for the sandbox and host link decisions', async () => {
      const connectDomains = Array.from(
        { length: 400 },
        (_unused, index) => `https://host${index}.example.com`,
      );
      mockFetchHtml.mockResolvedValue({ html: '<p>app</p>', csp: { connectDomains } });
      const { iframe } = mountBridge(makeResource(), client);
      await flush();

      const csp = JSON.parse(new URL(iframe.src).searchParams.get('csp') as string);
      expect(csp.connectDomains).toHaveLength(32);
      await act(async () => {
        await latest().onopenlink?.({ url: 'https://host0.example.com/x' }, requestExtra());
      });
      expect(openSpy).toHaveBeenCalledTimes(1);
      await act(async () => {
        await latest().onopenlink?.({ url: 'https://host399.example.com/x' }, requestExtra());
      });
      expect(openSpy).toHaveBeenCalledTimes(1);
    });

    it('denies every link after a failed read', async () => {
      mockFetchHtml.mockRejectedValue(new Error('boom'));
      mountBridge(
        makeResource({
          csp: { connectDomains: ['https://api.example.com'] },
        } as Partial<UIResource>),
        client,
      );
      await flush();

      await act(async () => {
        await latest().onopenlink?.({ url: 'https://api.example.com/x' }, requestExtra());
      });
      expect(openSpy).not.toHaveBeenCalled();
    });

    it('reports cancellation and thrown browser failures', async () => {
      mockFetchHtml.mockResolvedValue({
        html: '<p>app</p>',
        csp: { connectDomains: ['https://api.example.com'] },
      });
      mountBridge(makeResource(), client);
      await flush();
      const controller = new AbortController();
      controller.abort();

      await expect(
        latest().onopenlink?.({ url: 'https://api.example.com/x' }, { signal: controller.signal }),
      ).resolves.toEqual({ isError: true });
      openSpy.mockImplementationOnce(() => {
        throw new Error('browser failure');
      });
      await expect(
        latest().onopenlink?.({ url: 'https://api.example.com/x' }, requestExtra()),
      ).resolves.toEqual({ isError: true });
    });
  });

  describe('host request forwarding', () => {
    it('propagates each SDK request signal to the matching server operation', async () => {
      mockCallTool.mockResolvedValue({ content: [] });
      mockReadResource.mockResolvedValue({ contents: [] });
      mockListResources.mockResolvedValue({ resources: [] });
      mockListTemplates.mockResolvedValue({ resourceTemplates: [] });
      mountBridge(makeResource(), client);
      await flush();
      const extra = requestExtra();

      await latest().oncalltool?.({ name: 'next', arguments: { q: 2 } }, extra);
      await latest().onreadresource?.({ uri: 'ui://detail' }, extra);
      await latest().onlistresources?.({ cursor: 'a' }, extra);
      await latest().onlistresourcetemplates?.({ cursor: 'b' }, extra);

      expect(mockCallTool).toHaveBeenCalledWith('demo', 'next', { q: 2 }, extra.signal);
      expect(mockReadResource).toHaveBeenCalledWith('demo', 'ui://detail', extra.signal);
      expect(mockListResources).toHaveBeenCalledWith('demo', 'a', extra.signal);
      expect(mockListTemplates).toHaveBeenCalledWith('demo', 'b', extra.signal);
    });

    it('reports unsupported or rejected message delivery as an error', async () => {
      mountBridge(makeResource(), client);
      await flush();
      const bridge = latest();

      await expect(
        bridge.onmessage?.({ content: [{ type: 'image' }] }, requestExtra()),
      ).resolves.toEqual({ isError: true });
      mockAsk.mockReturnValueOnce(false);
      await expect(
        bridge.onmessage?.({ content: [{ type: 'text', text: 'hello' }] }, requestExtra()),
      ).resolves.toEqual({ isError: true });
    });
  });

  describe('teardown', () => {
    it('does not deliver an awaited teardown completion after the View was disposed', async () => {
      const onTeardown = jest.fn();
      const mounted = mountBridge(makeResource(), client, { onTeardown });
      await flush();
      const bridge = latest();
      await bridge.oninitialized?.();
      let finishTeardown: () => void = () => {};
      bridge.teardownResource = jest.fn(
        () => new Promise<Record<string, never>>((resolve) => (finishTeardown = () => resolve({}))),
      );

      act(() => bridge.emit('requestteardown'));
      act(() => mounted.view.unmount());
      finishTeardown();
      await flush();

      expect(onTeardown).not.toHaveBeenCalled();
    });

    it('disposes the bridge and the theme observer on requestteardown', async () => {
      const onTeardown = jest.fn();
      const iframe = document.createElement('iframe');
      iframe.setAttribute('data-sandbox-url', SANDBOX_URL);
      document.body.appendChild(iframe);
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <RecoilRoot>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </RecoilRoot>
      );
      renderHook(
        () =>
          useAppBridge({
            iframeRef: { current: iframe },
            resource: makeResource(),
            toolArgs: undefined,
            toolResult: undefined,
            onSizeChanged: jest.fn(),
            onTeardown,
          }),
        { wrapper },
      );
      await flush();

      const bridge = latest();
      await act(async () => bridge.oninitialized?.());
      await act(async () => bridge.emit('requestteardown'));
      await flush();

      expect(bridge.teardowns).toBeGreaterThan(0);
      expect(bridge.closed).toBe(true);
      expect(onTeardown).toHaveBeenCalled();

      await act(async () => {
        document.documentElement.classList.add('dark');
        await Promise.resolve();
      });
      expect(bridge.hostContextChanges).toHaveLength(0);
    });

    it('pushes theme changes to a live bridge', async () => {
      mountBridge(makeResource(), client);
      await flush();

      await act(async () => {
        document.documentElement.classList.add('dark');
        await Promise.resolve();
      });
      expect(latest().hostContextChanges).toHaveLength(1);
    });
  });

  describe('handshake payloads', () => {
    it('sends tool input before the tool result on initialize', async () => {
      mountBridge(makeResource(), client);
      await flush();
      await act(async () => {
        await latest().oninitialized?.();
      });
      expect(latest().toolInput).toEqual([{ arguments: { q: 1 } }]);
      expect(latest().toolResults).toEqual([{ content: [] }]);
    });

    it('sends tool lifecycle data only once if initialized repeats', async () => {
      mountBridge(makeResource(), client);
      await flush();
      await latest().oninitialized?.();
      await latest().oninitialized?.();
      expect(latest().toolInput).toHaveLength(1);
      expect(latest().toolResults).toHaveLength(1);
    });
  });
});
