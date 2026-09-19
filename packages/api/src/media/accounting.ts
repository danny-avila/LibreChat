import type {
  MediaAccountingMethods,
  MediaOwnerScope,
  MediaStoredJob,
} from '@librechat/data-schemas';
import type { MediaConfig, MediaIntegration } from 'librechat-data-provider';
import type { MediaAccounting, MediaContext } from './service';
import type { MediaProviderUsage } from './provider';
import { buildInitialBalance } from '~/middleware/checkBalance';
import { mediaAccountingMode } from './service';
import { MediaServiceError } from './errors';

export interface MediaAccountingService extends MediaAccounting {
  ensureReady(): Promise<void>;
  scopes: MediaAccountingMethods['listMediaAccountingScopes'];
  reconcile(scope: MediaOwnerScope, config: MediaConfig): Promise<number>;
}

function frozenMode(job: MediaStoredJob): 'balance' | 'transactions' | 'none' {
  if (!job.execution.accountingMode) {
    throw new MediaServiceError(
      'not_ready',
      409,
      'The media accounting mode needs reconciliation.',
    );
  }
  return job.execution.accountingMode;
}

function cost(job: MediaStoredJob, usage?: MediaProviderUsage): number | undefined {
  const value =
    usage?.costUSD ??
    (job.provider.recovery?.terminalStatus === 'cancelled'
      ? undefined
      : job.execution.billing?.estimatedCostUSD);
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new MediaServiceError('not_ready', 409, 'The provider cost needs reconciliation.');
  }
  return value;
}

export function createMediaAccounting({
  repository,
  now,
}: {
  repository: MediaAccountingMethods;
  now: () => number;
}): MediaAccountingService {
  async function reserve(
    job: MediaStoredJob,
    integration: MediaIntegration,
    context: MediaContext,
  ): Promise<void> {
    if (job.executionOwner === 'chat') return;
    const mode = frozenMode(job);
    if (mode !== mediaAccountingMode(context.appConfig)) {
      throw new MediaServiceError(
        'not_ready',
        409,
        'Media billing policy changed before dispatch.',
      );
    }
    if (mode !== 'balance') return;
    const billing = job.execution.billing;
    if (
      !billing?.maxCostUSD ||
      !billing.creditsPerUSD ||
      !integration.billing?.maxCostUSD ||
      billing.maxCostUSD > integration.billing.maxCostUSD ||
      billing.creditsPerUSD !== integration.billing.creditsPerUSD
    ) {
      throw new MediaServiceError('not_ready', 409, 'A validated media cost limit is required.');
    }
    const result = await repository.acquireMediaHold({
      scope: context.scope,
      jobId: job.jobId,
      estimatedCredits: (billing.estimatedCostUSD ?? billing.maxCostUSD) * billing.creditsPerUSD,
      maxCredits: billing.maxCostUSD * billing.creditsPerUSD,
      now: new Date(now()).toISOString(),
      reviewAt: new Date(now() + context.config.recovery.attentionAfterMs).toISOString(),
      policy: context.config.accounting,
      initialBalance: buildInitialBalance(context.scope.ownerId, context.appConfig.balance),
    });
    if (result.status === 'held') return;
    if (result.status === 'insufficient') {
      throw new MediaServiceError(
        'quota_exceeded',
        429,
        'There are not enough available media credits.',
      );
    }
    throw new MediaServiceError(
      'not_ready',
      409,
      'Media billing needs reconciliation before dispatch.',
    );
  }

  async function settle(
    job: MediaStoredJob,
    usage: MediaProviderUsage | undefined,
    context: MediaContext,
  ): Promise<void> {
    if (job.executionOwner === 'chat') return;
    const mode = frozenMode(job);
    if (mode === 'none') return;
    const costUSD = cost(job, usage);
    const creditsPerUSD = job.execution.billing?.creditsPerUSD;
    const credits =
      costUSD !== undefined && creditsPerUSD !== undefined ? costUSD * creditsPerUSD : undefined;
    if (mode === 'transactions') {
      await repository.recordMediaUsage({
        scope: context.scope,
        jobId: job.jobId,
        credits,
        costUSD,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        model: job.execution.modelId,
      });
      return;
    }
    if (credits === undefined || costUSD === undefined || creditsPerUSD === undefined) {
      throw new MediaServiceError('not_ready', 409, 'The paid media cost needs reconciliation.');
    }
    const result = await repository.settleMediaJob({
      scope: context.scope,
      jobId: job.jobId,
      effect: {
        kind: 'charge',
        credits,
        costUSD,
        creditsPerUSD,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        model: job.execution.modelId,
      },
      policy: context.config.accounting,
    });
    if (result.status !== 'settled') {
      throw new MediaServiceError('not_ready', 409, 'Media settlement is still being reconciled.');
    }
  }

  async function release(job: MediaStoredJob, context: MediaContext): Promise<void> {
    if (job.executionOwner === 'chat' || frozenMode(job) !== 'balance') return;
    const result = await repository.releaseMediaHold({
      scope: context.scope,
      jobId: job.jobId,
      policy: context.config.accounting,
      certainNoCharge: true,
    });
    if (result.status !== 'settled') {
      throw new MediaServiceError(
        'not_ready',
        409,
        'Media credit release is still being reconciled.',
      );
    }
  }

  return {
    reserve,
    settle,
    release,
    ensureReady: () => repository.ensureMediaAccountingIndexes(),
    scopes: (input) => repository.listMediaAccountingScopes(input),
    reconcile: (scope, config) =>
      repository.reconcileMediaAccounting({
        scope,
        limit: config.limits.pageSize,
        policy: config.accounting,
      }),
  };
}
