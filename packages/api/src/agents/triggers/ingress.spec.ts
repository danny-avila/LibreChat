import express from 'express';
import request from 'supertest';
import type { Application } from 'express';
import type { AgentTriggerIngressDependencies } from './ingress';
import type { AgentTriggerStoredRecord } from './service';
import { AgentTriggerServiceUnavailableError } from './service';
import { createAgentTriggerIngressHandlers } from './ingress';

const USER_ID = '507f1f77bcf86cd799439011';
const DELIVERY_KEY = `trigger_${'a'.repeat(64)}`;
const AVAILABLE_AT = new Date('2026-08-17T12:00:00.000Z');
const CREATED_AT = new Date('2026-08-17T11:59:59.000Z');

function delivery(overrides: Partial<AgentTriggerStoredRecord> = {}): AgentTriggerStoredRecord {
  return {
    id: '68a1c312abc123abc123abc1',
    user: USER_ID,
    deliveryKey: DELIVERY_KEY,
    fingerprint: 'fingerprint',
    orderingKey: 'ordering-key',
    laneSequence: 1,
    envelope: { secret: 'not-public' },
    status: 'pending',
    attempts: 0,
    availableAt: AVAILABLE_AT,
    createdAt: CREATED_AT,
    history: [
      {
        attempt: 1,
        outcome: 'retry',
        at: CREATED_AT,
        workerId: 'private-worker-id',
      },
    ],
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<AgentTriggerIngressDependencies> = {},
): AgentTriggerIngressDependencies {
  return {
    enqueue: jest.fn(async () => ({
      id: '68a1c312abc123abc123abc1',
      deliveryKey: DELIVERY_KEY,
      status: 'pending' as const,
      availableAt: AVAILABLE_AT,
      replayed: false,
    })),
    getDelivery: jest.fn(async () => delivery()),
    now: () => 1_755_430_000_000,
    createRequestId: () => 'generated-request-id',
    ...overrides,
  };
}

function createApp(
  deps: AgentTriggerIngressDependencies,
  user: { id: string; role?: string; tenantId?: string } | null = {
    id: USER_ID,
    role: 'USER',
    tenantId: 'tenant-1',
  },
): Application {
  const app = express();
  const handlers = createAgentTriggerIngressHandlers(deps);
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { user: user ?? undefined, requestId: 'request-from-context' });
    next();
  });
  app.post('/api/agents/v1/events', handlers.enqueueEvent);
  app.get('/api/agents/v1/events/:id', handlers.getEvent);
  return app;
}

function fireEvent() {
  return {
    mode: 'fire',
    event: {
      id: 'event-1',
      type: 'resource.ready',
      occurredAt: 1_755_429_900_000,
      source: { id: 'webhook-1', type: 'webhook' },
      payload: { resourceId: 'resource-1' },
    },
    target: { agentId: 'agent-1' },
    input: 'Handle resource-1.',
    orderingKey: 'resource-1',
    principal: { id: 'attacker-controlled' },
  };
}

describe('agent trigger event ingress', () => {
  it('builds a trusted envelope and returns an opaque delivery status URL', async () => {
    const deps = dependencies();
    const response = await request(createApp(deps))
      .post('/api/agents/v1/events')
      .set('Idempotency-Key', 'source-delivery-1')
      .send(fireEvent());

    expect(response.status).toBe(202);
    expect(response.headers.location).toBe(`/api/agents/v1/events/${DELIVERY_KEY}`);
    expect(response.body).toEqual({
      id: DELIVERY_KEY,
      status: 'pending',
      availableAt: AVAILABLE_AT.toISOString(),
      replayed: false,
    });
    expect(deps.enqueue).toHaveBeenCalledWith(
      {
        version: 1,
        mode: 'fire',
        requestId: 'request-from-context',
        deliveryId: 'source-delivery-1',
        receivedAt: 1_755_430_000_000,
        principal: { userId: USER_ID, role: 'USER', tenantId: 'tenant-1' },
        event: fireEvent().event,
        target: { agentId: 'agent-1' },
        input: 'Handle resource-1.',
      },
      { orderingKey: 'resource-1' },
    );
  });

  it('admits fenced steer events through the same source-neutral contract', async () => {
    const deps = dependencies();
    const response = await request(createApp(deps))
      .post('/api/agents/v1/events')
      .set('Idempotency-Key', 'steer-delivery-1')
      .send({
        mode: 'steer',
        event: {
          id: 'clock-expired-1',
          type: 'clock.expired',
          occurredAt: 1_755_429_950_000,
          source: { id: 'match-1', type: 'tournament-controller' },
        },
        target: {
          agentId: 'agent-1',
          conversationId: 'conversation-1',
          generationCreatedAt: 1_755_429_940_000,
          preempt: true,
        },
        input: 'Your clock expired. Submit immediately.',
      });

    expect(response.status).toBe(202);
    expect(deps.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'steer',
        deliveryId: 'steer-delivery-1',
        target: {
          agentId: 'agent-1',
          conversationId: 'conversation-1',
          generationCreatedAt: 1_755_429_940_000,
          preempt: true,
        },
      }),
      {},
    );
  });

  it('fails closed when the idempotency header is absent or duplicated', async () => {
    const deps = dependencies();
    const app = createApp(deps);

    const missing = await request(app).post('/api/agents/v1/events').send(fireEvent());
    const duplicated = await request(app)
      .post('/api/agents/v1/events')
      .set('Idempotency-Key', 'delivery-1,delivery-2')
      .send(fireEvent());

    expect(missing.status).toBe(400);
    expect(duplicated.status).toBe(400);
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it('rejects malformed event bodies before enqueueing', async () => {
    const deps = dependencies();
    const response = await request(createApp(deps))
      .post('/api/agents/v1/events')
      .set('Idempotency-Key', 'delivery-1')
      .send({ ...fireEvent(), mode: 'unknown' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('invalid_event');
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it('reports idempotency conflicts and temporary delivery unavailability', async () => {
    const conflict = dependencies({
      enqueue: jest.fn(async () => {
        const error = new Error(`Delivery ${DELIVERY_KEY} was reused with different content`);
        error.name = 'AgentTriggerDeliveryConflictError';
        throw error;
      }),
    });
    const unavailable = dependencies({
      enqueue: jest.fn(async () => {
        throw new AgentTriggerServiceUnavailableError('Delivery service is starting');
      }),
    });

    const conflictResponse = await request(createApp(conflict))
      .post('/api/agents/v1/events')
      .set('Idempotency-Key', 'delivery-1')
      .send(fireEvent());
    const unavailableResponse = await request(createApp(unavailable))
      .post('/api/agents/v1/events')
      .set('Idempotency-Key', 'delivery-1')
      .send(fireEvent());

    expect(conflictResponse.status).toBe(409);
    expect(conflictResponse.body.error.code).toBe('idempotency_conflict');
    expect(unavailableResponse.status).toBe(503);
    expect(unavailableResponse.body.error.code).toBe('trigger_delivery_unavailable');
  });

  it('returns a safe owner-scoped delivery projection', async () => {
    const settledAt = new Date('2026-08-17T12:00:01.000Z');
    const attemptedAt = new Date('2026-08-17T12:00:00.500Z');
    const deps = dependencies({
      getDelivery: jest.fn(async () =>
        delivery({
          status: 'dead',
          attempts: 3,
          settledAt,
          lastError: {
            code: 'FORBIDDEN',
            message: 'Agent access was revoked',
            certainty: 'definite',
            retryable: false,
            attemptedAt,
            status: 403,
          },
        }),
      ),
    });

    const response = await request(createApp(deps)).get(`/api/agents/v1/events/${DELIVERY_KEY}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: DELIVERY_KEY,
      status: 'dead',
      attempts: 3,
      availableAt: AVAILABLE_AT.toISOString(),
      createdAt: CREATED_AT.toISOString(),
      settledAt: settledAt.toISOString(),
      error: {
        code: 'FORBIDDEN',
        message: 'Agent access was revoked',
        certainty: 'definite',
        retryable: false,
        attemptedAt: attemptedAt.toISOString(),
        status: 403,
      },
    });
    expect(response.body).not.toHaveProperty('envelope');
    expect(response.body).not.toHaveProperty('history');
    expect(response.body).not.toHaveProperty('orderingKey');
  });

  it('hides missing, foreign-user, and cross-tenant deliveries', async () => {
    const missing = dependencies({ getDelivery: jest.fn(async () => null) });
    const foreign = dependencies({
      getDelivery: jest.fn(async () => delivery({ user: '507f191e810c19729de860ea' })),
    });
    const crossTenant = dependencies({
      getDelivery: jest.fn(async () => delivery({ tenantId: 'tenant-2' })),
    });

    const responses = await Promise.all(
      [missing, foreign, crossTenant].map((deps) =>
        request(createApp(deps)).get(`/api/agents/v1/events/${DELIVERY_KEY}`),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
    expect(responses.map((response) => response.body.error.code)).toEqual([
      'event_not_found',
      'event_not_found',
      'event_not_found',
    ]);
  });

  it('rejects malformed delivery ids without querying storage', async () => {
    const deps = dependencies();
    const response = await request(createApp(deps)).get('/api/agents/v1/events/not-a-key');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('invalid_event');
    expect(deps.getDelivery).not.toHaveBeenCalled();
  });

  it('requires an authenticated principal even when mounted incorrectly', async () => {
    const deps = dependencies();
    const response = await request(createApp(deps, null))
      .post('/api/agents/v1/events')
      .set('Idempotency-Key', 'delivery-1')
      .send(fireEvent());

    expect(response.status).toBe(401);
    expect(deps.enqueue).not.toHaveBeenCalled();
  });
});
