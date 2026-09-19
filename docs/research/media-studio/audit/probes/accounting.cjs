/* Synthetic, local audit probes. Run from repository root with current workspace builds. */
process.env.MEILI_HOST = '';
process.env.MEILI_MASTER_KEY = '';
process.env.SEARCH = 'false';
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const schemas = require('@librechat/data-schemas');
const api = require('@librechat/api');
const { resolveMediaConfig } = require('librechat-data-provider');

const policy = { maxHoldsPerUser: 4, maxAttempts: 30 };

async function settlementOrdering() {
  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri(), { autoIndex: false });
    schemas.createModels(mongoose);
    const db = schemas.createMethods(mongoose);
    await db.ensureMediaAccountingIndexes();
    async function scenario(mediaFirst) {
      const scope = { ownerId: new mongoose.Types.ObjectId().toString(), tenantId: null };
      const jobId = `ordering-${scope.ownerId}`;
      await mongoose.models.Balance.create({ user: scope.ownerId, tokenCredits: 1000 });
      await mongoose.models.MediaJob.collection.insertOne({
        ...scope, jobId, executionOwner: 'media', receipt: { phase: 'accepted' },
        provider: { certainty: 'unsubmitted' },
      });
      assert.equal((await db.reserveBalance({
        user: scope.ownerId, amount: 600, reservationId: 'chat',
        expiresAt: new Date(Date.now() + 60000),
      })).reserved, true);
      assert.equal((await db.acquireMediaHold({
        scope, jobId, estimatedCredits: 400, maxCredits: 400, policy,
        now: new Date().toISOString(), reviewAt: new Date(Date.now() + 60000).toISOString(),
      })).status, 'held');
      const media = () => db.settleMediaJob({
        scope, jobId, policy, effect: { kind: 'charge', credits: 800, costUSD: 0.0008 },
      });
      const chat = () => db.updateBalance({ user: scope.ownerId, incrementValue: -600 });
      if (mediaFirst) { await media(); await chat(); } else { await chat(); await media(); }
      await db.releaseBalanceReservation({ user: scope.ownerId, reservationId: 'chat', amount: 600 });
      const stored = await mongoose.models.Balance.findOne({ user: scope.ownerId })
        .select('+mediaDebtCredits +reservedCredits').lean();
      await db.updateBalance({ user: scope.ownerId, incrementValue: 400 });
      await db.reconcileMediaAccounting({ scope, policy, limit: 10 });
      const afterTopup = await mongoose.models.Balance.findOne({ user: scope.ownerId })
        .select('+mediaDebtCredits').lean();
      return { credits: stored.tokenCredits, debt: stored.mediaDebtCredits ?? 0,
        reserved: stored.reservedCredits, creditsAfter400Topup: afterTopup.tokenCredits };
    }
    const mediaFirst = await scenario(true);
    const chatFirst = await scenario(false);
    assert.equal(mediaFirst.debt, 0);
    assert.equal(chatFirst.debt, 400);
    assert.equal(mediaFirst.creditsAfter400Topup, 400);
    assert.equal(chatFirst.creditsAfter400Topup, 0);
    console.log(JSON.stringify({ probe: 'cross-writer-settlement-order', mediaFirst, chatFirst }));
    await db.ensureMediaIndexes();
    const scope = { ownerId: new mongoose.Types.ObjectId().toString(), tenantId: null };
    await mongoose.models.Balance.create({ user: scope.ownerId, tokenCredits: 0 });
    const config = resolveMediaConfig({ enabled: true, titles: { endpoint: 'openAI', model: 'title' },
      integrations: [{ id: 'images', api: 'openai.images', endpointRef: { kind: 'direct', apiKey: 'synthetic' },
        catalog: { kind: 'configured', models: ['gpt-image-1'] }, operations: ['image.generate'],
        billing: { maxCostUSD: 1, estimatedCostUSD: 0.5 } }] });
    const context = { scope, config, appConfig: { config: {}, fileStrategy: 'local',
      balance: { enabled: true }, transactions: { enabled: true } }, canUse: true, canCreate: true };
    let titles = 0, reserves = 0;
    const services = api.createMediaServices({ repository: db, now: Date.now,
      adapters: [{ api: 'openai.images', operations: ['image.generate'] }],
      resolveConnection: async () => ({ id: 'images', api: 'openai.images', binding: 'synthetic',
        baseURL: 'https://invalid.example', headers: {} }),
      titles: async () => { titles++; },
      accounting: { reserve: async () => { reserves++; }, settle: async () => {}, release: async () => {} },
      log: error => { throw error; }, storage: {}, transport: {},
    });
    const catalog = await services.queries.catalog(context);
    const request = { clientRequestId: 'same-zero-balance-request', operation: 'image.generate',
      prompt: 'A synthetic image', selection: { connectionId: 'images', modelId: 'gpt-image-1',
        catalogVersion: catalog.version } };
    const receipts = await Promise.all(Array.from({ length: 3 }, () => services.commands.submit(request, context)));
    assert.equal(new Set(receipts.map(receipt => receipt.jobId)).size, 1);
    assert.equal(titles, 3);
    assert.equal(reserves, 0);
    console.log(JSON.stringify({ probe: 'title-admission-and-idempotency', zeroBalance: true,
      requests: receipts.length, distinctJobs: 1, titleInvocations: titles, creditAdmissions: reserves }));
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
}

async function terminalEstimate() {
  const effects = [];
  const accounting = api.createMediaAccounting({ now: Date.now, repository: {
    settleMediaJob: async ({ effect }) => { effects.push(effect); return { status: 'settled' }; },
  }});
  const job = {
    jobId: 'failed-provider-job', executionOwner: 'media',
    execution: { accountingMode: 'balance', modelId: 'synthetic-video',
      billing: { estimatedCostUSD: 0.5, maxCostUSD: 1, creditsPerUSD: 1000000 } },
    provider: { certainty: 'terminal', recovery: { terminalStatus: 'failed' } },
  };
  await accounting.settle(job, undefined, { scope: { ownerId: 'synthetic', tenantId: null },
    config: { accounting: policy } });
  assert.equal(effects[0].credits, 500000);
  console.log(JSON.stringify({ probe: 'failed-terminal-estimate', effect: effects[0] }));
}

async function titlePublication() {
  const config = resolveMediaConfig({ titles: { endpoint: 'openAI', model: 'synthetic-title' } });
  const context = { scope: { ownerId: 'synthetic', tenantId: null }, config,
    appConfig: { config: {}, fileStrategy: 'local', balance: { enabled: true },
      transactions: { enabled: true } }, canUse: true, canCreate: true };
  async function scenario(failPublication) {
    const spends = [], errors = [];
    let invoked = 0;
    const generate = api.createMediaTitleGenerator({
      repository: { replaceMediaThreadTitle: async () => {
        if (failPublication) throw new Error('synthetic title write failure');
        return true;
      } },
      resolveModel: async () => ({ provider: 'openAI', clientOptions: { model: 'synthetic-title' } }),
      invoke: async () => { invoked++; return { text: 'A New Title',
        usage: { provider: 'openAI', input_tokens: 100, output_tokens: 5, total_tokens: 125,
          input_token_details: { cache_read: 80 } } }; },
      usage: { spendTokens: async (metadata, tokens) => spends.push({ metadata, tokens }),
        spendStructuredTokens: async (metadata, tokens) => spends.push({ metadata, tokens }) },
      withScope: async (_scope, operation) => operation(), log: error => errors.push(error.message),
    });
    await generate({ context, threadId: 'synthetic-thread', prompt: 'A different title',
      currentTitle: 'Old Title', operation: 'image.generate' });
    return { invoked, spends, errors };
  }
  const succeeded = await scenario(false);
  const failed = await scenario(true);
  assert.equal(succeeded.invoked, 1);
  assert.equal(succeeded.spends.length, 1);
  assert.equal(failed.invoked, 1);
  assert.equal(failed.spends.length, 0);
  const fullUsageSpends = [];
  await api.recordCollectedUsage({
    spendTokens: async (metadata, tokens) => fullUsageSpends.push({ metadata, tokens }),
    spendStructuredTokens: async (metadata, tokens) => fullUsageSpends.push({ metadata, tokens }),
  }, { user: 'synthetic', model: 'synthetic-title', context: 'title',
    collectedUsage: [{ provider: 'openAI', input_tokens: 100, output_tokens: 5, total_tokens: 125,
      input_token_details: { cache_read: 80 } }] });
  assert.equal(fullUsageSpends[0].tokens.completionTokens, 25);
  console.log(JSON.stringify({ probe: 'title-publication-gates-usage', succeeded, failed, fullUsageSpends }));
}

(async () => {
  await settlementOrdering();
  await terminalEstimate();
  await titlePublication();
})().catch(error => { console.error(error); process.exitCode = 1; });
