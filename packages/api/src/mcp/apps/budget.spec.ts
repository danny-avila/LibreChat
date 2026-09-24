import {
  MCPAppBudgetError,
  MCPAppOperationBudget,
  assertMCPAppResultFits,
  getMCPAppOperationLimits,
  guardMCPAppSSEEvents,
} from './budget';

const env = { ...process.env };
afterEach(() => {
  for (const name of [
    'MCP_APP_MAX_UPSTREAM_BYTES',
    'MCP_APP_OPERATION_TIMEOUT_MS',
    'MCP_APP_MAX_ACTIVE_OPERATIONS',
  ]) {
    if (env[name] === undefined) delete process.env[name];
    else process.env[name] = env[name];
  }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('MCP App operation limits', () => {
  it('ignores malformed or unsafe environment overrides', () => {
    process.env.MCP_APP_MAX_UPSTREAM_BYTES = '0';
    process.env.MCP_APP_OPERATION_TIMEOUT_MS = 'Infinity';
    process.env.MCP_APP_MAX_ACTIVE_OPERATIONS = '99999999';
    expect(getMCPAppOperationLimits()).toEqual({
      maxBytes: 4 * 1024 * 1024,
      timeoutMs: 30_000,
      maxActive: 16,
    });
  });

  it('rejects App JSON larger than the configured serialized UTF-8 limit', () => {
    process.env.MCP_APP_MAX_UPSTREAM_BYTES = '12';
    expect(() => assertMCPAppResultFits({ text: '😀' })).toThrow(MCPAppBudgetError);
    expect(() => assertMCPAppResultFits({ text: '😀' })).toThrow('too large');
    expect(() => assertMCPAppResultFits({ text: 'a' })).not.toThrow();
  });

  it('admits at most one live operation with zero pending waiters, releasing on settlement', async () => {
    process.env.MCP_APP_MAX_ACTIVE_OPERATIONS = '1';
    const budget = new MCPAppOperationBudget();
    const pending = deferred<string>();
    const first = budget.run(new AbortController().signal, () => pending.promise);
    await expect(
      budget.run(new AbortController().signal, async () => 'second'),
    ).rejects.toMatchObject({ status: 503, code: 'mcp_app_capacity' });
    pending.resolve('first');
    await expect(first).resolves.toBe('first');
    await expect(budget.run(new AbortController().signal, async () => 'third')).resolves.toBe(
      'third',
    );
  });

  it('holds an aborted work slot until the underlying operation actually settles', async () => {
    process.env.MCP_APP_MAX_ACTIVE_OPERATIONS = '1';
    const budget = new MCPAppOperationBudget();
    const abort = new AbortController();
    const pending = deferred<string>();
    const first = budget.run(abort.signal, () => pending.promise);
    abort.abort(new Error('client left'));
    await expect(first).rejects.toThrow('client left');
    await expect(
      budget.run(new AbortController().signal, async () => 'not yet'),
    ).rejects.toMatchObject({ status: 503 });
    pending.reject(new Error('late failure'));
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(budget.run(new AbortController().signal, async () => 'ready')).resolves.toBe(
      'ready',
    );
  });

  it('aborts by absolute deadline even if the upstream promise ignores cancellation', async () => {
    process.env.MCP_APP_OPERATION_TIMEOUT_MS = '20';
    const budget = new MCPAppOperationBudget();
    const pending = deferred<string>();
    let signal: AbortSignal | undefined;
    await expect(
      budget.run(new AbortController().signal, (operationSignal) => {
        signal = operationSignal;
        return pending.promise;
      }),
    ).rejects.toMatchObject({ status: 504, code: 'mcp_app_timeout' });
    expect(signal?.aborted).toBe(true);
    pending.resolve('late');
  });
});

describe('MCP App SSE event guard', () => {
  const encoder = new TextEncoder();
  const toResponse = (chunks: string[]) => {
    let index = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) controller.enqueue(encoder.encode(chunks[index++]));
        else controller.close();
      },
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };

  it('allows multiple events in a long-lived stream, resetting between CRLF-delimited events', async () => {
    const data = 'data: hello\r\n\r\ndata: world\r\n\r\n';
    const response = guardMCPAppSSEEvents(
      toResponse(['data: hello\r', '\n\r', '\ndata: world\r\n\r\n']),
      14,
    );
    await expect(response.text()).resolves.toBe(data);
  });

  it('blocks a chunked event before the SDK can parse its data', async () => {
    const response = guardMCPAppSSEEvents(toResponse(['data: ', 'x'.repeat(20), '\n\n']), 16);
    await expect(response.text()).rejects.toThrow('MCP App event is too large');
  });

  it('does not modify non-event-stream HTTP responses', async () => {
    const response = new Response('ok', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    expect(guardMCPAppSSEEvents(response, 1)).toBe(response);
  });
});
