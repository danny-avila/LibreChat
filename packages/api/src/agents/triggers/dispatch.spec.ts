import type { AgentTriggerEnvelope } from './envelope';
import { AgentTriggerDispatchError, dispatchAgentTrigger } from './dispatch';
import { createAgentTriggerEnvelope } from './envelope';

describe('dispatchAgentTrigger', () => {
  const createFireInput = () => ({
    mode: 'fire' as const,
    requestId: 'request-1',
    deliveryId: 'delivery-1',
    receivedAt: 20,
    principal: { id: 'user-1' },
    target: { agentId: 'agent-1' },
    event: {
      id: 'event-1',
      type: 'resource.ready',
      occurredAt: 10,
      source: { id: 'source-1', type: 'webhook' },
    },
    input: 'Handle the ready resource.',
  });

  const fireEnvelope = () => createAgentTriggerEnvelope(createFireInput());

  it('routes fire deliveries with their stable idempotency identity and abort signal', async () => {
    const controller = new AbortController();
    const fire = jest.fn(async () => ({ status: 'accepted' as const }));
    const steer = jest.fn(async () => ({ status: 'accepted' as const }));
    const envelope = fireEnvelope();

    await expect(
      dispatchAgentTrigger(envelope, { fire, steer }, { signal: controller.signal }),
    ).resolves.toEqual({ status: 'accepted' });

    expect(fire).toHaveBeenCalledWith(envelope, {
      idempotencyKey: expect.stringMatching(/^trigger_[a-f0-9]{64}$/),
      signal: controller.signal,
    });
    expect(steer).not.toHaveBeenCalled();
  });

  it('routes steer deliveries without requiring a fire implementation detail', async () => {
    const fire = jest.fn(async () => 'fire');
    const steer = jest.fn(async () => 'steer');
    const envelope = createAgentTriggerEnvelope({
      ...createFireInput(),
      mode: 'steer',
      target: {
        agentId: 'agent-1',
        conversationId: 'conversation-1',
        generationCreatedAt: 15,
      },
    });

    await expect(dispatchAgentTrigger(envelope, { fire, steer })).resolves.toBe('steer');
    expect(steer).toHaveBeenCalledWith(envelope, {
      idempotencyKey: expect.stringMatching(/^trigger_[a-f0-9]{64}$/),
    });
    expect(fire).not.toHaveBeenCalled();
  });

  it('propagates handler failures without falling back to another mode', async () => {
    const error = new Error('fire rejected');
    const fire = jest.fn(async () => Promise.reject(error));
    const steer = jest.fn(async () => 'steer');

    await expect(dispatchAgentTrigger(fireEnvelope(), { fire, steer })).rejects.toBe(error);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(steer).not.toHaveBeenCalled();
  });

  it('rejects unknown modes before deriving identity or calling a handler', () => {
    const fire = jest.fn(async () => 'fire');
    const steer = jest.fn(async () => 'steer');
    const envelope = {
      ...fireEnvelope(),
      mode: 'resume',
    } as unknown as AgentTriggerEnvelope;

    expect(() => dispatchAgentTrigger(envelope, { fire, steer })).toThrow(
      new AgentTriggerDispatchError('Unsupported agent trigger mode: resume'),
    );
    expect(fire).not.toHaveBeenCalled();
    expect(steer).not.toHaveBeenCalled();
  });

  it('rejects unknown envelope versions before deriving identity or calling a handler', () => {
    const fire = jest.fn(async () => 'fire');
    const steer = jest.fn(async () => 'steer');
    const envelope = {
      ...fireEnvelope(),
      version: 2,
    } as unknown as AgentTriggerEnvelope;

    expect(() => dispatchAgentTrigger(envelope, { fire, steer })).toThrow(
      new AgentTriggerDispatchError('Unsupported agent trigger envelope version: 2'),
    );
    expect(fire).not.toHaveBeenCalled();
    expect(steer).not.toHaveBeenCalled();
  });

  it('rejects malformed v1 envelopes before deriving identity or calling a handler', () => {
    const fire = jest.fn(async () => 'fire');
    const steer = jest.fn(async () => 'steer');
    const malformed = { ...fireEnvelope() };
    Reflect.deleteProperty(malformed, 'target');
    const envelope = malformed as unknown as AgentTriggerEnvelope;

    expect(() => dispatchAgentTrigger(envelope, { fire, steer })).toThrow(
      new AgentTriggerDispatchError('target must be an object'),
    );
    expect(fire).not.toHaveBeenCalled();
    expect(steer).not.toHaveBeenCalled();
  });
});
