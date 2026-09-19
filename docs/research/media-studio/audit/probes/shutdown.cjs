const assert = require('node:assert/strict');
const { createMediaWorker } = require('@librechat/api');
const { resolveMediaConfig } = require('librechat-data-provider');

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// A successful run confirms the defect in the audited branch, not the fixed invariant.
async function runScenario(phase) {
  const claimEntered = deferred();
  const claimResult = deferred();
  const executionFinished = deferred();
  const scope = { ownerId: 'audit-owner', tenantId: null };
  const integration = {
    id: 'audit-provider',
    api: 'openai.videos',
    endpointRef: { kind: 'direct', apiKey: 'synthetic-key' },
    catalog: { kind: 'configured', models: ['audit-video'] },
    operations: ['video.generate'],
  };
  const config = resolveMediaConfig({
    enabled: true,
    integrations: [integration],
    worker: { shutdownTimeoutMs: 100 },
  });
  const timestamp = new Date().toISOString();
  let job = {
    ...scope,
    jobId: 'audit-job',
    threadId: 'audit-thread',
    turnId: 'audit-turn',
    version: 1,
    phase,
    executionOwner: 'media',
    operation: 'video.generate',
    createdAt: timestamp,
    leaseToken: 'audit-lease',
    leaseUntil: new Date(Date.now() + 60_000).toISOString(),
    provider: phase === 'queued'
      ? { certainty: 'unsubmitted' }
      : { certainty: 'submitted', operationId: 'audit-operation' },
    request: { operation: 'video.generate', prompt: 'Synthetic audit prompt' },
    execution: {
      connectionId: integration.id,
      modelId: 'audit-video',
      api: integration.api,
      bindingRevision: 'audit-binding',
      accountingMode: 'none',
    },
  };
  const emptyPage = () => Promise.resolve({ items: [] });
  const logs = [];
  const providerCalls = [];
  let stopReturned = false;
  const worker = createMediaWorker(
    {
      repository: {
        ensureMediaIndexes: async () => {},
        listDueMediaScopes: async () => ({ items: [scope] }),
        listMediaCleanupScopes: emptyPage,
        reconcileMediaPermits: emptyPage,
        recoverMediaPublications: async () => {},
        claimMediaJob: async () => {
          claimEntered.resolve();
          return claimResult.promise;
        },
        getMediaJob: async () => job,
        acquireMediaPermits: async () => true,
        beginMediaSubmission: async () => {
          job = { ...job, phase: 'submitting', version: job.version + 1 };
          return job;
        },
        recordMediaJobObservation: async ({ observation }) => {
          job = { ...job, ...observation, version: job.version + 1 };
          return job;
        },
        releaseMediaPermits: async () => executionFinished.resolve(),
      },
      adapters: [
        {
          api: integration.api,
          submit: async (_request, _inputs, context) => {
            providerCalls.push({ operation: 'submit', afterStop: stopReturned, aborted: context.signal.aborted });
            return { status: 'running', operationId: 'audit-operation' };
          },
          poll: async (_operationId, context) => {
            providerCalls.push({ operation: 'poll', afterStop: stopReturned, aborted: context.signal.aborted });
            return { status: 'running', operationId: 'audit-operation' };
          },
        },
      ],
      loadContext: async () => ({ scope, config, canUse: true, canCreate: true, appConfig: { media: config, transactions: { enabled: false } } }),
      resolveConnection: async () => ({ binding: 'audit-binding' }),
      accounting: { reserve: async () => {} },
      asSystem: (work) => work(),
      withScope: (_scope, work) => work(),
      now: Date.now,
      id: () => 'audit-worker',
      log: (error) => logs.push(error.message),
    },
    { prepare: async () => ({ inputs: [] }) },
    config,
  );
  const watchdog = setTimeout(() => {
    throw new Error('Shutdown probe timed out');
  }, 5_000);
  try {
    await worker.start();
    await claimEntered.promise;
    await worker.stop();
    stopReturned = true;
    assert.equal(worker.available, false);
    claimResult.resolve(job);
    await executionFinished.promise;
    assert.deepEqual(logs, []);
    assert.deepEqual(providerCalls, [{ operation: phase === 'queued' ? 'submit' : 'poll', afterStop: true, aborted: false }]);
    console.log(JSON.stringify({
      scenario: 'claim completes after worker.stop resolves',
      phase,
      invariant: 'No new provider operation starts after stop resolves',
      expectedProviderCallsAfterStop: 0,
      actualProviderCallsAfterStop: providerCalls.length,
      providerCalls,
      regressionConfirmed: true,
    }, null, 2));
  } finally {
    clearTimeout(watchdog);
    await worker.stop();
  }
}

async function main() {
  await runScenario('running');
  await runScenario('queued');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
