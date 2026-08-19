import type { CreateAgentTriggerEnvelopeInput } from './envelope';
import {
  AGENT_TRIGGER_ENVELOPE_VERSION,
  AgentTriggerEnvelopeError,
  createAgentTriggerEnvelope,
  getAgentTriggerIdempotencyKey,
  parseAgentTriggerEnvelope,
} from './envelope';

describe('createAgentTriggerEnvelope', () => {
  const createFireInput = (): CreateAgentTriggerEnvelopeInput => ({
    mode: 'fire',
    requestId: 'request-1',
    deliveryId: 'subscription-1:event-1',
    receivedAt: 1_725_000_000_010,
    principal: {
      id: 'user-1',
      role: 'USER',
      tenantId: 'tenant-1',
    },
    target: { agentId: 'agent-1' },
    event: {
      id: 'event-1',
      type: 'work.ready',
      occurredAt: 1_725_000_000_000,
      source: { id: 'source-1', type: 'mcp' },
      payload: { resourceId: 'resource-1', attempt: 1 },
    },
    input: 'Inspect the ready work item.',
  });

  it('creates a detached, versioned fire envelope with a projected principal', () => {
    const input = createFireInput();
    const principal = input.principal as NonNullable<
      CreateAgentTriggerEnvelopeInput['principal']
    > & {
      password?: string;
    };
    principal.password = 'must-not-cross';
    const envelope = createAgentTriggerEnvelope(input);
    const payload = input.event.payload as { resourceId: string };
    payload.resourceId = 'changed-after-dispatch';

    expect(envelope).toEqual({
      version: AGENT_TRIGGER_ENVELOPE_VERSION,
      mode: 'fire',
      requestId: 'request-1',
      deliveryId: 'subscription-1:event-1',
      receivedAt: 1_725_000_000_010,
      principal: { userId: 'user-1', role: 'USER', tenantId: 'tenant-1' },
      target: { agentId: 'agent-1' },
      event: {
        id: 'event-1',
        type: 'work.ready',
        occurredAt: 1_725_000_000_000,
        source: { id: 'source-1', type: 'mcp' },
        payload: { resourceId: 'resource-1', attempt: 1 },
      },
      input: 'Inspect the ready work item.',
    });
    expect(JSON.parse(JSON.stringify(envelope))).toEqual(envelope);
    expect(JSON.stringify(envelope)).not.toContain('must-not-cross');
  });

  it('parses and detaches a serialized envelope', () => {
    const created = createAgentTriggerEnvelope(createFireInput());
    const serialized = JSON.parse(JSON.stringify(created)) as unknown;
    const parsed = parseAgentTriggerEnvelope(serialized);

    expect(parsed).toEqual(created);
    expect(parsed).not.toBe(serialized);
    expect(parsed.event).not.toBe((serialized as { event: object }).event);
  });

  it('requires a generation fence for steer deliveries', () => {
    const envelope = createAgentTriggerEnvelope({
      ...createFireInput(),
      mode: 'steer',
      target: {
        agentId: 'agent-1',
        conversationId: 'conversation-1',
        generationCreatedAt: 1_725_000_000_005,
        preempt: true,
      },
    });

    expect(envelope.mode).toBe('steer');
    expect(envelope.target).toEqual({
      agentId: 'agent-1',
      conversationId: 'conversation-1',
      generationCreatedAt: 1_725_000_000_005,
      preempt: true,
    });
  });

  it('requires an exact existing branch for continue deliveries', () => {
    const envelope = createAgentTriggerEnvelope({
      ...createFireInput(),
      mode: 'continue',
      target: {
        agentId: 'agent-1',
        conversationId: 'conversation-1',
        parentMessageId: 'response-1',
      },
    });

    expect(envelope.mode).toBe('continue');
    expect(envelope.target).toEqual({
      agentId: 'agent-1',
      conversationId: 'conversation-1',
      parentMessageId: 'response-1',
    });
    expect(parseAgentTriggerEnvelope(JSON.parse(JSON.stringify(envelope)))).toEqual(envelope);
  });

  it('builds a stable generation-compatible idempotency key per delivery target', () => {
    const first = createAgentTriggerEnvelope(createFireInput());
    const retry = createAgentTriggerEnvelope({
      ...createFireInput(),
      requestId: 'request-2',
      receivedAt: 1_725_000_000_020,
    });
    const anotherDelivery = createAgentTriggerEnvelope({
      ...createFireInput(),
      deliveryId: 'subscription-2:event-1',
    });
    const anotherSource = createAgentTriggerEnvelope({
      ...createFireInput(),
      event: {
        ...createFireInput().event,
        source: { id: 'source-2', type: 'webhook' },
      },
    });
    const anotherEvent = createAgentTriggerEnvelope({
      ...createFireInput(),
      event: { ...createFireInput().event, id: 'event-2' },
    });

    const firstKey = getAgentTriggerIdempotencyKey(first);
    expect(getAgentTriggerIdempotencyKey(retry)).toBe(firstKey);
    expect(getAgentTriggerIdempotencyKey(anotherDelivery)).not.toBe(firstKey);
    expect(getAgentTriggerIdempotencyKey(anotherSource)).not.toBe(firstKey);
    expect(getAgentTriggerIdempotencyKey(anotherEvent)).not.toBe(firstKey);
    expect(firstKey).toMatch(/^trigger_[a-f0-9]{64}$/);
    expect(firstKey).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(firstKey.length).toBeLessThanOrEqual(128);
  });

  it.each([
    ['requestId', { requestId: ' ' }],
    ['deliveryId', { deliveryId: '' }],
    ['principal.id', { principal: undefined }],
    ['target.agentId', { target: { agentId: '' } }],
    ['event', { event: undefined }],
    ['event.id', { event: { ...createFireInput().event, id: '' } }],
    ['event.type', { event: { ...createFireInput().event, type: '' } }],
    ['event.source.id', { event: { ...createFireInput().event, source: { id: '', type: 'mcp' } } }],
    ['input', { input: '' }],
  ])('rejects an invalid %s', (_path, override) => {
    expect(() =>
      createAgentTriggerEnvelope({
        ...createFireInput(),
        ...override,
      } as CreateAgentTriggerEnvelopeInput),
    ).toThrow(AgentTriggerEnvelopeError);
  });

  it('rejects invalid timestamps and malformed steer controls', () => {
    expect(() =>
      createAgentTriggerEnvelope({
        ...createFireInput(),
        event: { ...createFireInput().event, occurredAt: Number.NaN },
      }),
    ).toThrow('event.occurredAt must be a non-negative integer timestamp');

    expect(() =>
      createAgentTriggerEnvelope({
        ...createFireInput(),
        mode: 'steer',
        target: {
          agentId: 'agent-1',
          conversationId: 'conversation-1',
          generationCreatedAt: -1,
          preempt: true,
        },
      }),
    ).toThrow('target.generationCreatedAt must be a non-negative integer timestamp');

    expect(() =>
      createAgentTriggerEnvelope({
        ...createFireInput(),
        mode: 'steer',
        target: {
          agentId: 'agent-1',
          conversationId: 'conversation-1',
          generationCreatedAt: 1,
          preempt: 'yes',
        },
      } as unknown as CreateAgentTriggerEnvelopeInput),
    ).toThrow('target.preempt must be a boolean');

    expect(() =>
      createAgentTriggerEnvelope({
        ...createFireInput(),
        mode: 'steer',
        target: undefined,
      } as unknown as CreateAgentTriggerEnvelopeInput),
    ).toThrow('target.agentId must be a non-empty string');
  });

  it('rejects non-JSON and circular event payloads', () => {
    expect(() =>
      createAgentTriggerEnvelope({
        ...createFireInput(),
        event: { ...createFireInput().event, payload: { callback: () => undefined } },
      } as unknown as CreateAgentTriggerEnvelopeInput),
    ).toThrow('event.payload.callback contains a non-JSON function value');

    const payload: { self?: object } = {};
    payload.self = payload;
    expect(() =>
      createAgentTriggerEnvelope({
        ...createFireInput(),
        event: { ...createFireInput().event, payload },
      } as unknown as CreateAgentTriggerEnvelopeInput),
    ).toThrow('event.payload.self contains a circular reference');
  });

  it('rejects unknown trigger modes at runtime', () => {
    expect(() =>
      createAgentTriggerEnvelope({
        ...createFireInput(),
        mode: 'launch',
      } as unknown as CreateAgentTriggerEnvelopeInput),
    ).toThrow('Unsupported agent trigger mode: launch');
  });
});
