import {
  FileSources,
  mediaSubmissionRequestSchema,
  resolveMediaConfig,
} from 'librechat-data-provider';
import type { MediaAccountingMethods, MediaStoredJob } from '@librechat/data-schemas';
import type { MediaContext } from './service';
import { createMediaAccounting } from './accounting';

describe('media accounting provider bridge', () => {
  const config = resolveMediaConfig({
    enabled: true,
    integrations: [
      {
        id: 'images',
        api: 'openrouter.images',
        endpointRef: { kind: 'custom', name: 'OpenRouter' },
        catalog: { kind: 'configured', models: ['model-a'] },
        operations: ['image.generate'],
        billing: { creditsPerUSD: 1_000, estimatedCostUSD: 0.2, maxCostUSD: 0.5 },
      },
    ],
  });
  const scope = { ownerId: 'owner', tenantId: null };
  const context: MediaContext = {
    scope,
    config,
    canUse: true,
    canCreate: true,
    appConfig: {
      config: {},
      fileStrategy: FileSources.local,
      imageOutputType: 'png',
      balance: { enabled: true },
      transactions: { enabled: true },
    },
  };
  const request = mediaSubmissionRequestSchema.parse({
    clientRequestId: 'request',
    operation: 'image.generate',
    prompt: 'A forest',
    selection: { connectionId: 'images', modelId: 'model-a', catalogVersion: 'v1' },
  });
  const job: MediaStoredJob = {
    ...scope,
    schemaVersion: 1,
    jobId: 'job',
    threadId: 'thread',
    turnId: 'turn',
    version: 1,
    phase: 'queued',
    executionOwner: 'media',
    operation: 'image.generate',
    selection: request.selection,
    createdAt: '2026-09-16T00:00:00.000Z',
    updatedAt: '2026-09-16T00:00:00.000Z',
    outputs: [],
    allowedActions: { cancel: true, retry: false },
    queueCapacity: 20,
    clientRequestId: request.clientRequestId,
    fingerprint: 'fingerprint',
    request,
    execution: {
      ...request.selection,
      api: 'openrouter.images',
      bindingRevision: 'binding',
      accountingMode: 'balance',
      billing: config.integrations[0].billing,
    },
    receipt: {
      schemaVersion: 1,
      clientRequestId: request.clientRequestId,
      threadId: 'thread',
      turnId: 'turn',
      jobId: 'job',
      phase: 'accepted',
    },
    newThread: true,
    threadEpoch: 1,
    provider: { certainty: 'unsubmitted' },
    dueAt: '2026-09-16T00:00:00.000Z',
  };
  let repository: jest.Mocked<MediaAccountingMethods>;
  beforeEach(() => {
    repository = {
      ensureMediaAccountingIndexes: jest.fn().mockResolvedValue(undefined),
      listMediaAccountingScopes: jest.fn().mockResolvedValue({ items: [] }),
      hasMediaAccountingObligations: jest.fn().mockResolvedValue(false),
      deleteMediaAccountingHistory: jest.fn().mockResolvedValue(undefined),
      acquireMediaHold: jest.fn().mockResolvedValue({ status: 'held', settlementId: 'receipt' }),
      settleMediaJob: jest.fn().mockResolvedValue({ status: 'settled', settlementId: 'receipt' }),
      releaseMediaHold: jest.fn().mockResolvedValue({ status: 'settled', settlementId: 'receipt' }),
      reconcileMediaAccounting: jest.fn().mockResolvedValue(1),
      recordMediaUsage: jest.fn().mockResolvedValue(undefined),
    };
  });
  const bridge = () =>
    createMediaAccounting({ repository, now: () => Date.parse('2026-09-16T00:00:00.000Z') });

  it('holds the explicit maximum and settles the reported cost using frozen rates', async () => {
    await bridge().reserve(job, config.integrations[0], context);
    expect(repository.acquireMediaHold).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedCredits: 200, maxCredits: 500 }),
    );
    await bridge().settle(job, { costUSD: 0.125 }, context);
    expect(repository.settleMediaJob).toHaveBeenCalledWith(
      expect.objectContaining({
        effect: expect.objectContaining({ credits: 125, costUSD: 0.125, creditsPerUSD: 1_000 }),
      }),
    );
  });

  it('uses an explicit estimate only when the provider does not report cost', async () => {
    await bridge().settle(job, undefined, context);
    expect(repository.settleMediaJob).toHaveBeenCalledWith(
      expect.objectContaining({ effect: expect.objectContaining({ credits: 200, costUSD: 0.2 }) }),
    );
  });

  it('keeps unknown paid cost in reconciliation rather than settling for zero', async () => {
    const unpriced = {
      ...job,
      execution: { ...job.execution, billing: { creditsPerUSD: 1_000, maxCostUSD: 0.5 } },
    };
    await expect(bridge().settle(unpriced, undefined, context)).rejects.toMatchObject({
      code: 'not_ready',
    });
    expect(repository.settleMediaJob).not.toHaveBeenCalled();
    expect(repository.releaseMediaHold).not.toHaveBeenCalled();
  });

  it('accepts an explicit zero provider cost', async () => {
    await bridge().settle(job, { costUSD: 0 }, context);
    expect(repository.settleMediaJob).toHaveBeenCalledWith(
      expect.objectContaining({ effect: expect.objectContaining({ credits: 0, costUSD: 0 }) }),
    );
  });

  it('settles existing liability after balance configuration is disabled', async () => {
    const disabled = {
      ...context,
      appConfig: { ...context.appConfig, balance: { enabled: false } },
    };
    await bridge().settle(job, { costUSD: 0.2 }, disabled);
    expect(repository.settleMediaJob).toHaveBeenCalledTimes(1);
    await expect(bridge().reserve(job, config.integrations[0], disabled)).rejects.toMatchObject({
      code: 'not_ready',
    });
  });

  it('records transaction-only usage without creating a balance hold', async () => {
    const transactionJob: MediaStoredJob = {
      ...job,
      execution: { ...job.execution, accountingMode: 'transactions', billing: undefined },
    };
    const transactionContext = {
      ...context,
      appConfig: { ...context.appConfig, balance: { enabled: false } },
    };
    await bridge().reserve(transactionJob, config.integrations[0], transactionContext);
    await bridge().settle(transactionJob, { inputTokens: 20 }, transactionContext);
    expect(repository.acquireMediaHold).not.toHaveBeenCalled();
    expect(repository.recordMediaUsage).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 20, credits: undefined, costUSD: undefined }),
    );
  });

  it('never reserves, debits, or releases a second accounting effect for native chat', async () => {
    const chatJob: MediaStoredJob = { ...job, executionOwner: 'chat' };
    await bridge().reserve(chatJob, config.integrations[0], context);
    await bridge().settle(chatJob, { costUSD: 0.2 }, context);
    await bridge().release(chatJob, context);
    expect(repository.acquireMediaHold).not.toHaveBeenCalled();
    expect(repository.settleMediaJob).not.toHaveBeenCalled();
    expect(repository.releaseMediaHold).not.toHaveBeenCalled();
  });
});
