import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import type { AgentTriggerDeliveryPersistence, AgentTriggerService } from './service';
import type { AgentTriggerFetch } from './host';
import { __resetShutdownStateForTests } from '../../app/shutdown';
import { createAgentTriggerEnvelope } from './envelope';
import { createAgentTriggerService } from './service';

const DB_SETUP_TIMEOUT_MS = 60_000;
let mongoServer: MongoMemoryServer;
let service: AgentTriggerService | undefined;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { autoIndex: false });
  createModels(mongoose);
}, DB_SETUP_TIMEOUT_MS);

afterEach(async () => {
  await service?.stop();
  service = undefined;
  __resetShutdownStateForTests();
  await mongoose.models.AgentTriggerDelivery.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, DB_SETUP_TIMEOUT_MS);

const envelope = () =>
  createAgentTriggerEnvelope({
    mode: 'fire',
    requestId: 'request-1',
    deliveryId: 'delivery-1',
    receivedAt: 20,
    principal: { id: new mongoose.Types.ObjectId().toString(), tenantId: 'tenant-1' },
    target: { agentId: 'agent-1' },
    event: {
      id: 'event-1',
      type: 'resource.ready',
      occurredAt: 10,
      source: { id: 'source-1', type: 'webhook' },
    },
    input: 'Handle the ready resource.',
  });

async function eventuallySucceeded(deliveryKey: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const delivery = await service!.getDelivery(deliveryKey);
    if (delivery?.status === 'succeeded') {
      return delivery;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the queued trigger to succeed');
}

describe('durable trigger delivery integration', () => {
  it('moves a trusted envelope through Mongo, the lease worker, and host admission', async () => {
    const fetcher = jest.fn<ReturnType<AgentTriggerFetch>, Parameters<AgentTriggerFetch>>(
      async () =>
        new Response(
          JSON.stringify({
            status: 'started',
            streamId: 'conversation-1',
            conversationId: 'conversation-1',
            generationCreatedAt: 25,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    service = createAgentTriggerService({
      methods: createMethods(mongoose) as ReturnType<typeof createMethods> &
        AgentTriggerDeliveryPersistence,
      fetch: fetcher,
      mintToken: () => 'trigger-token',
      deliveryOptions: { concurrency: 2, tickMs: 5, retryBaseMs: 5 },
    });
    await service.initialize({
      address: { address: '127.0.0.1', family: 'IPv4', port: 3080 },
    });

    const receipt = await service.enqueue(envelope(), { orderingKey: 'resource-1' });
    const delivered = await eventuallySucceeded(receipt.deliveryKey);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(delivered).toMatchObject({
      id: receipt.id,
      status: 'succeeded',
      attempts: 1,
      result: {
        mode: 'fire',
        status: 'started',
        conversationId: 'conversation-1',
      },
      history: [{ attempt: 1, outcome: 'succeeded' }],
    });
  });
});
