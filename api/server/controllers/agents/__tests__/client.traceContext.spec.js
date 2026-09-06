const AgentClient = require('../client');

/** Minimal `this` for the trace context builder — it only reads `options`. */
function buildTraceContext(options) {
  return AgentClient.prototype.buildTraceContext.call({ options });
}

describe('AgentClient.buildTraceContext', () => {
  it('reads the model label from the trace-only option the initializer sets', () => {
    expect(
      buildTraceContext({
        endpoint: 'agents',
        endpointType: undefined,
        spec: 'support-bot',
        traceContext: { modelLabel: 'Helper' },
      }),
    ).toEqual({
      endpoint: 'agents',
      endpointType: undefined,
      modelLabel: 'Helper',
      spec: 'support-bot',
    });
  });

  it('falls back to a top-level modelLabel option when no trace context is given', () => {
    expect(buildTraceContext({ endpoint: 'openAI', modelLabel: 'Custom' })).toMatchObject({
      endpoint: 'openAI',
      modelLabel: 'Custom',
    });
    expect(buildTraceContext({ endpoint: 'openAI' }).modelLabel).toBeUndefined();
  });
});
