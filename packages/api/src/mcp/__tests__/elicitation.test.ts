import {
  asElicitationFlowManager,
  extractUrlElicitation,
  generateElicitationFlowId,
  isHttpUrl,
  parseElicitationFlowId,
} from '~/mcp/elicitation';

describe('elicitation flow IDs', () => {
  it('round-trips the userId, serverName, and toolName it was built from', () => {
    const flowId = generateElicitationFlowId('user-1', 'jira_server', 'create_issue');

    expect(parseElicitationFlowId(flowId)).toEqual({
      userId: 'user-1',
      serverName: 'jira_server',
      toolName: 'create_issue',
      nonce: expect.any(String),
      tenantId: undefined,
    });
  });

  it('preserves a colon inside a segment instead of skewing the parsed fields', () => {
    const flowId = generateElicitationFlowId('user-1', 'ns:jira', 'do:thing');
    const parsed = parseElicitationFlowId(flowId);

    expect(parsed?.serverName).toBe('ns:jira');
    expect(parsed?.toolName).toBe('do:thing');
    expect(parsed?.userId).toBe('user-1');
  });

  it('round-trips the tenantId for tenant-scoped flows', () => {
    const flowId = generateElicitationFlowId('user-1', 'jira_server', 'create_issue', 'acme:eu');
    const parsed = parseElicitationFlowId(flowId);

    expect(parsed?.tenantId).toBe('acme:eu');
    expect(parsed?.serverName).toBe('jira_server');
  });

  it('generates a distinct ID per invocation so concurrent calls never collide', () => {
    const a = generateElicitationFlowId('user-1', 'jira_server', 'create_issue');
    const b = generateElicitationFlowId('user-1', 'jira_server', 'create_issue');

    expect(a).not.toBe(b);
  });

  it('returns null for IDs with too few segments', () => {
    expect(parseElicitationFlowId('user-1:jira_server')).toBeNull();
    expect(parseElicitationFlowId('tenant:acme:user-1')).toBeNull();
  });
});

describe('asElicitationFlowManager', () => {
  it('re-views the same manager instance without copying it', () => {
    const manager = { createFlow: jest.fn(), completeFlow: jest.fn() };

    expect(asElicitationFlowManager(manager)).toBe(manager);
  });
});

describe('MCPConnection.setElicitationHandler registry', () => {
  // Exercises the real method against a stubbed SDK client. A single stable
  // dispatcher is installed while any handler is pending; each call gets a
  // disposer that removes only its own entry, and `removeRequestHandler` fires
  // exactly when the registry drains — so a later call disposing first cannot
  // orphan an earlier still-pending call.
  const { MCPConnection } = jest.requireActual<typeof import('../connection')>('../connection');

  type FakeElicitRequest = { params: { message: string; mode?: string; url?: string } };
  type FakeElicitExtra = { signal: AbortSignal };
  type FakeDispatcher = (request: FakeElicitRequest, extra: FakeElicitExtra) => unknown;

  const makeFakeConnection = () => {
    let dispatcher: FakeDispatcher | undefined;
    const client = {
      setRequestHandler: jest.fn((_schema: unknown, fn: FakeDispatcher) => {
        dispatcher = fn;
      }),
      removeRequestHandler: jest.fn(() => {
        dispatcher = undefined;
      }),
    };
    const connection = Object.assign(Object.create(MCPConnection.prototype), {
      client,
      elicitationHandlers: [],
    }) as InstanceType<typeof MCPConnection>;
    const dispatch = (params: FakeElicitRequest['params']) =>
      dispatcher?.({ params }, { signal: new AbortController().signal });
    return { client, connection, dispatch };
  };
  const handler = () => Promise.resolve({ action: 'accept' as const });

  it('removes the handler when the registering call settles last', () => {
    const { client, connection } = makeFakeConnection();
    const dispose = MCPConnection.prototype.setElicitationHandler.call(connection, handler);

    dispose();

    expect(client.removeRequestHandler).toHaveBeenCalledTimes(1);
    expect(client.removeRequestHandler).toHaveBeenCalledWith('elicitation/create');
  });

  it('installs one stable dispatcher for concurrent calls and disposal is idempotent', () => {
    const { client, connection } = makeFakeConnection();
    const disposeFirst = MCPConnection.prototype.setElicitationHandler.call(connection, handler);
    const disposeSecond = MCPConnection.prototype.setElicitationHandler.call(connection, handler);

    expect(client.setRequestHandler).toHaveBeenCalledTimes(1);

    disposeFirst();
    expect(client.removeRequestHandler).not.toHaveBeenCalled();

    disposeSecond();
    disposeSecond();
    expect(client.removeRequestHandler).toHaveBeenCalledTimes(1);
  });

  it('routes to the most-recent call and does not orphan an earlier one when a later call disposes first', async () => {
    const { client, connection, dispatch } = makeFakeConnection();
    const handlerA = jest.fn(() => Promise.resolve({ action: 'accept' as const }));
    const handlerB = jest.fn(() => Promise.resolve({ action: 'decline' as const }));

    const disposeA = MCPConnection.prototype.setElicitationHandler.call(connection, handlerA);
    const disposeB = MCPConnection.prototype.setElicitationHandler.call(connection, handlerB);

    expect(client.setRequestHandler).toHaveBeenCalledTimes(1);

    await dispatch({ message: 'first' });
    expect(handlerB).toHaveBeenCalledTimes(1);
    expect(handlerA).not.toHaveBeenCalled();

    disposeB();
    expect(client.removeRequestHandler).not.toHaveBeenCalled();

    await dispatch({ message: 'second' });
    expect(handlerA).toHaveBeenCalledTimes(1);

    disposeA();
    expect(client.removeRequestHandler).toHaveBeenCalledTimes(1);
    expect(client.removeRequestHandler).toHaveBeenCalledWith('elicitation/create');
  });

  it('forwards the per-request abort signal to the routed handler', async () => {
    const { connection, dispatch } = makeFakeConnection();
    const handlerWithSignal = jest.fn((_params: unknown, _signal: AbortSignal) =>
      Promise.resolve({ action: 'accept' as const }),
    );

    MCPConnection.prototype.setElicitationHandler.call(connection, handlerWithSignal);
    await dispatch({ message: 'need input' });

    expect(handlerWithSignal).toHaveBeenCalledWith(
      { message: 'need input' },
      expect.any(AbortSignal),
    );
  });
});

describe('extractUrlElicitation', () => {
  const elicitation = {
    mode: 'url',
    message: 'Please authorize access to github',
    url: 'https://bedrock-agentcore.eu-west-1.amazonaws.com/identities/oauth2/authorize?request_uri=abc',
    elicitationId: '8cd9f2ba-103d-44c9-8471-6dd02df67c1b',
  };

  it('extracts from a protocol-level McpError shape (code -32042 + data)', () => {
    const error = { code: -32042, data: { elicitations: [elicitation] } };
    expect(extractUrlElicitation(error)).toEqual(elicitation);
  });

  it('extracts from a gateway HTTP-wrapped transport error (the AgentCore wire shape)', () => {
    // Exact shape observed live: gateway returns JSON-RPC errors with a non-2xx
    // HTTP status, so the SDK throws a StreamableHTTPError whose message embeds
    // the raw body and whose `code` is the HTTP status, not -32042.
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 9,
      error: {
        code: -32042,
        message: 'This request requires authorization.',
        data: { elicitations: [elicitation] },
      },
    });
    const error = Object.assign(
      new Error(`Streamable HTTP error: Error POSTing to endpoint: ${body}`),
      {
        code: 401,
      },
    );
    expect(extractUrlElicitation(error)).toEqual(elicitation);
  });

  it('extracts a whitespaced HTTP-wrapped body (pretty-printed / key-reordered gateway JSON)', () => {
    // A gateway that pretty-prints yields `"code": -32042` (note the space) and
    // may order keys differently; a literal `"code":-32042` substring match would
    // miss it, so extraction must tolerate JSON formatting variance.
    const body = JSON.stringify(
      {
        jsonrpc: '2.0',
        id: 9,
        error: {
          message: 'This request requires authorization.',
          data: { elicitations: [elicitation] },
          code: -32042,
        },
      },
      null,
      2,
    );
    const error = Object.assign(
      new Error(`Streamable HTTP error: Error POSTing to endpoint: ${body}`),
      { code: 401 },
    );
    expect(extractUrlElicitation(error)).toEqual(elicitation);
  });

  it('returns null for non-elicitation errors in both shapes', () => {
    expect(extractUrlElicitation(new Error('boom'))).toBeNull();
    expect(extractUrlElicitation({ code: -32600, data: {} })).toBeNull();
    expect(
      extractUrlElicitation(
        new Error(
          'Streamable HTTP error: Error POSTing to endpoint: {"jsonrpc":"2.0","id":2,"error":{"code":-32600,"message":"Session not initialized"}}',
        ),
      ),
    ).toBeNull();
    expect(extractUrlElicitation(null)).toBeNull();
  });

  it('returns null for a -32042 mention with an unparseable body', () => {
    expect(
      extractUrlElicitation(new Error('Error POSTing to endpoint: {"code":-32042, truncated')),
    ).toBeNull();
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox'])(
    'drops a protocol-level elicitation carrying a hostile-scheme URL (%s)',
    (url) => {
      const error = { code: -32042, data: { elicitations: [{ ...elicitation, url }] } };
      expect(extractUrlElicitation(error)).toBeNull();
    },
  );

  it.each(['javascript:alert(1)', 'data:text/html,pwn', 'vbscript:msgbox'])(
    'drops an HTTP-wrapped gateway elicitation carrying a hostile-scheme URL (%s)',
    (url) => {
      const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 9,
        error: { code: -32042, message: 'auth', data: { elicitations: [{ ...elicitation, url }] } },
      });
      const error = Object.assign(
        new Error(`Streamable HTTP error: Error POSTing to endpoint: ${body}`),
        { code: 401 },
      );
      expect(extractUrlElicitation(error)).toBeNull();
    },
  );
});

describe('isHttpUrl', () => {
  it.each(['https://auth.example.com/authorize', 'http://localhost:3000/callback'])(
    'accepts http(s) URLs (%s)',
    (url) => {
      expect(isHttpUrl(url)).toBe(true);
    },
  );

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox',
    'file:///etc/passwd',
    'not a url',
    '',
  ])('rejects non-http(s) or unparseable URLs (%s)', (url) => {
    expect(isHttpUrl(url)).toBe(false);
  });
});
