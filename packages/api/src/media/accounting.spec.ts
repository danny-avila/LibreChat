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

  it('uses the existing starting balance and refill configuration for media admission', async () => {
    await bridge().reserve(job, config.integrations[0], {
      ...context,
      appConfig: {
        ...context.appConfig,
        balance: {
          enabled: true,
          startBalance: 800,
          autoRefillEnabled: true,
          refillAmount: 400,
          refillIntervalValue: 1,
          refillIntervalUnit: 'days',
        },
      },
    });
    expect(repository.acquireMediaHold).toHaveBeenCalledWith(
      expect.objectContaining({
        initialBalance: {
          user: scope.ownerId,
          tokenCredits: 800,
          autoRefillEnabled: true,
          refillAmount: 400,
          refillIntervalValue: 1,
          refillIntervalUnit: 'days',
          lastRefill: expect.any(Date),
        },
      }),
    );
  });

  it('uses an explicit estimate only when the provider does not report cost', async () => {
    await bridge().settle(
      { ...job, provider: { certainty: 'terminal', recovery: { terminalStatus: 'completed' } } },
      undefined,
      context,
    );
    expect(repository.settleMediaJob).toHaveBeenCalledWith(
      expect.objectContaining({
        effect: expect.objectContaining({ credits: 200, costUSD: 0.2, costSource: 'estimate' }),
      }),
    );
  });

  it.each(['failed', 'cancelled'] as const)(
    'keeps an unknown %s cost unresolved even with a successful-request estimate',
    async (terminalStatus) => {
      const terminal: MediaStoredJob = {
        ...job,
        provider: { certainty: 'terminal', recovery: { terminalStatus } },
      };
      await expect(bridge().settle(terminal, { inputTokens: 20 }, context)).rejects.toMatchObject({
        code: 'not_ready',
      });
      expect(repository.settleMediaJob).not.toHaveBeenCalled();
      expect(repository.releaseMediaHold).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['failed', 0],
    ['failed', 0.1],
    ['cancelled', 0],
    ['cancelled', 0.1],
    ['completed', 0],
    ['completed', 0.1],
  ] as const)('settles authoritative %s usage of %s dollars', async (terminalStatus, costUSD) => {
    const terminal: MediaStoredJob = {
      ...job,
      provider: { certainty: 'terminal', recovery: { terminalStatus } },
    };
    await bridge().settle(terminal, { costUSD }, context);
    expect(repository.settleMediaJob).toHaveBeenCalledWith(
      expect.objectContaining({
        effect: expect.objectContaining({
          costUSD,
          credits: costUSD * 1_000,
          costSource: 'provider',
        }),
      }),
    );
    expect(repository.releaseMediaHold).not.toHaveBeenCalled();
  });

  it('does not use a completion estimate before there is a durable completed outcome', async () => {
    await expect(bridge().settle(job, undefined, context)).rejects.toMatchObject({
      code: 'not_ready',
    });
    expect(repository.settleMediaJob).not.toHaveBeenCalled();
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

  it('does not price an accepted cancellation using the completed-request estimate', async () => {
    const cancelled: MediaStoredJob = {
      ...job,
      provider: { certainty: 'terminal', recovery: { terminalStatus: 'cancelled' } },
    };
    await expect(bridge().settle(cancelled, undefined, context)).rejects.toMatchObject({
      code: 'not_ready',
    });
    expect(repository.settleMediaJob).not.toHaveBeenCalled();
    expect(repository.releaseMediaHold).not.toHaveBeenCalled();
    await bridge().settle(cancelled, { costUSD: 0 }, context);
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

  it('uses the frozen default credit currency for new transaction-only jobs', async () => {
    const transactionJob: MediaStoredJob = {
      ...job,
      execution: {
        ...job.execution,
        accountingMode: 'transactions',
        billing: { creditsPerUSD: 1_000_000 },
      },
    };
    await bridge().settle(transactionJob, { costUSD: 0.125, outputTokens: 30 }, context);
    expect(repository.recordMediaUsage).toHaveBeenCalledWith(
      expect.objectContaining({ credits: 125_000, costUSD: 0.125, outputTokens: 30 }),
    );
    expect(repository.settleMediaJob).not.toHaveBeenCalled();
  });

  it('preserves legacy transaction-only effects when the snapshot has no frozen rate', async () => {
    const transactionJob: MediaStoredJob = {
      ...job,
      execution: { ...job.execution, accountingMode: 'transactions', billing: undefined },
    };
    await bridge().settle(transactionJob, { costUSD: 0.125, outputTokens: 30 }, context);
    expect(repository.recordMediaUsage).toHaveBeenCalledWith(
      expect.objectContaining({ credits: undefined, costUSD: 0.125, outputTokens: 30 }),
    );
    expect(repository.settleMediaJob).not.toHaveBeenCalled();
  });

  it('does not create accounting effects when balances and transactions are disabled', async () => {
    const disabledJob: MediaStoredJob = {
      ...job,
      execution: { ...job.execution, accountingMode: 'none', billing: undefined },
    };
    const disabledContext: MediaContext = {
      ...context,
      appConfig: {
        ...context.appConfig,
        balance: { enabled: false },
        transactions: { enabled: false },
      },
    };
    await bridge().reserve(disabledJob, config.integrations[0], disabledContext);
    await bridge().settle(disabledJob, { costUSD: 0.2 }, disabledContext);
    await bridge().release(disabledJob, disabledContext);
    expect(repository.acquireMediaHold).not.toHaveBeenCalled();
    expect(repository.settleMediaJob).not.toHaveBeenCalled();
    expect(repository.recordMediaUsage).not.toHaveBeenCalled();
    expect(repository.releaseMediaHold).not.toHaveBeenCalled();
  });
});
