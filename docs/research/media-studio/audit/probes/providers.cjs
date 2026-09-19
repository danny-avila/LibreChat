const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const {
  createRESTMediaAdapters,
  createMediaServices,
  validateMediaOffering,
  assertModelBoundContent,
} = require('@librechat/api');
const { resolveMediaConfig, mediaSubmissionRequestSchema } = require('librechat-data-provider');

// Diagnostic: exit 0 confirms defects in the audited built artifact, not their correction.
// Synthetic credentials and intercepted provider boundaries; no network or database writes.
const adapters = createRESTMediaAdapters();
const config = resolveMediaConfig();
const reference = {
  role: 'reference', file_id: 'audit-image', type: 'image/png', data: Buffer.from('audit-image'),
};

function request(modelId, operation = 'image.generate', parameters = {}, inputs = [], extra = {}) {
  return mediaSubmissionRequestSchema.parse({
    clientRequestId: 'valid-owner-scoped-id', prompt: 'A blue cup', operation, parameters,
    inputs: inputs.map(({ role, file_id }) => ({ role, file_id })),
    selection: { connectionId: 'audit-provider', modelId, catalogVersion: 'audit-catalog' },
    ...extra,
  });
}

function fixture(api, respond = () => { throw new Error('Unexpected provider operation'); }) {
  const calls = [];
  const adapter = adapters.find((item) => item.api === api);
  assert(adapter, api);
  const context = {
    config, signal: new AbortController().signal,
    connection: {
      id: 'audit-provider', api, binding: 'synthetic-account-binding',
      baseURL: adapter.configuration?.baseURL || 'https://provider.example/v1',
      headers: { Authorization: 'Bearer synthetic-audit-key' },
      options: { brandId: '12345678-1234-4234-8234-123456789012' },
    },
    transport: {
      async json(call, schema) {
        calls.push(call);
        return schema.parse(await respond(call, calls.length));
      },
      async stream() { return Readable.from([]); },
    },
  };
  return { adapter, context, calls };
}

async function capabilityDispatchDrift() {
  const cases = [
    ['runway.videos', 'runway/gen-4.5', 'video.generate', { aspectRatio: '1:1' }, []],
    ['minimax.videos', 'minimax/hailuo-2.3', 'video.generate', { durationSeconds: 10, resolution: '1080P' }, []],
    ['google.vertex.videos', 'google/veo-3.1', 'video.generate', { durationSeconds: 4 }, [reference]],
    ['heygen.videos', 'heygen/avatar-iv', 'video.generate', {}, [reference]],
  ];
  const observations = [];
  for (const [api, modelId, operation, parameters, inputs] of cases) {
    const { adapter, context, calls } = fixture(api);
    const submission = request(modelId, operation, parameters, inputs);
    const profile = adapter.catalog(config).find((item) => item.modelId === modelId);
    const offering = { ...profile, connectionId: 'audit-provider', connectionName: 'Audit', api, available: true };
    validateMediaOffering(submission, offering, config.limits);
    await assert.rejects(adapter.submit(submission, inputs, context), { certainty: 'rejected' });
    assert.equal(calls.length, 0);
    observations.push({ api, modelId, parameters, roles: inputs.map((input) => input.role), catalogAccepted: true, adapterRejected: true });
  }
  return observations;
}

async function sourcefulIdempotencyCollision() {
  const { adapter, context, calls } = fixture('sourceful.images', (call) => ({
    data: { freestyle_image: {
      freestyle_image_id: '12345678-1234-4234-8234-123456789013',
      brand_id: context.connection.options.brandId, status: 'queued', image_url: null,
    } }, error: null,
  }));
  const first = request('sourceful/riverflow-v2-pro', 'image.generate', {}, [], { prompt: 'Owner A private design' });
  const second = request('sourceful/riverflow-v2-pro', 'image.generate', {}, [], { prompt: 'Owner B unrelated design' });
  await adapter.submit(first, [], context);
  await adapter.submit(second, [], context);
  assert.notEqual(JSON.parse(calls[0].body).instruction, JSON.parse(calls[1].body).instruction);
  assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
  return {
    sameOwnerScopedClientId: first.clientRequestId === second.clientRequestId,
    differentProviderInstructions: true,
    sameUpstreamIdempotencyKey: true,
    key: calls[0].headers['Idempotency-Key'],
    limit: 'Collision proved; actual upstream duplicate-response versus payload-conflict behavior was not exercised.',
  };
}

async function modelBoundPolicyBypass() {
  const { adapter, context: providerContext, calls } = fixture('alibaba.images', () => ({
    data: [{ url: 'https://results.example/image.png' }],
  }));
  const integration = {
    id: 'audit-provider', api: adapter.api,
    endpointRef: { kind: 'direct', apiKey: 'synthetic-audit-key' },
    catalog: { kind: 'configured', models: ['qwen/qwen-image-3'] },
    operations: ['image.generate'],
  };
  const media = resolveMediaConfig({ enabled: true, integrations: [integration] });
  const pii = { starterPatterns: [], customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' }] };
  const filters = {
    messages: { pii: { ...pii, fields: ['text'] } },
    modelParameters: { pii: { ...pii, fields: ['request_fields'] } },
  };
  const context = {
    scope: { ownerId: 'audit-owner', tenantId: null }, config: media,
    canUse: true, canCreate: true, appConfig: { config: {}, fileStrategy: 'local', media, filters },
  };
  const services = createMediaServices({
    adapters, transport: providerContext.transport, now: Date.now,
    resolveConnection: async () => providerContext.connection,
    repository: {}, storage: {}, accounting: {},
    withScope: (_scope, run) => run(), asSystem: (run) => run(), log: () => {},
  });
  const prompt = request('qwen/qwen-image-3', 'image.generate', {}, [], { prompt: 'PRIVATE-DESIGN' });
  await assert.rejects(services.prepare(prompt, context, false), { code: 'forbidden' });
  const negativePrompt = request('qwen/qwen-image-3', 'image.generate', { negativePrompt: 'PRIVATE-DESIGN' });
  assert.throws(() => assertModelBoundContent({ filters, agents: [{ options: negativePrompt.parameters }] }), /private value/);
  const prepared = await services.prepare(negativePrompt, context, false);
  await adapter.submit(negativePrompt, prepared.inputs, { ...providerContext, config: media });
  assert.equal(JSON.parse(calls[0].body).negative_prompt, 'PRIVATE-DESIGN');
  return { configuredMessagePolicyBlocksPrompt: true, existingModelParameterInspectorBlocksValue: true, mediaPrepareAllowsValue: true, providerReceivedUnfilteredNegativePrompt: true };
}

async function directGoogleSignedEmptyText() {
  const { adapter, context, calls } = fixture('google.generateContent', (_call, number) => number === 1 ? {
    candidates: [{ content: { parts: [
      { text: '', thoughtSignature: 'synthetic-signature' },
      { inlineData: { mimeType: 'image/png', data: Buffer.from('synthetic-image').toString('base64') } },
    ] } }],
  } : { candidates: [{ content: { parts: [{ text: 'continuation' }] } }] });
  const submission = request('google/gemini-3.1-flash-image');
  const result = await adapter.submit(submission, [], context);
  assert.equal(result.status, 'completed');
  assert.equal(result.parts.length, 1);
  await adapter.submit(submission, [], { ...context, continuation: { prompt: submission.prompt, inputs: [], parts: result.parts } });
  const replay = JSON.parse(calls[1].body).contents[1].parts;
  assert.equal(replay.some((part) => part.thoughtSignature === 'synthetic-signature'), false);
  return { upstreamPartCount: 2, storedPartCount: 1, signatureRetainedInContinuation: false };
}

(async () => {
  console.log(JSON.stringify({
    capabilityDispatchDrift: await capabilityDispatchDrift(),
    sourcefulIdempotencyCollision: await sourcefulIdempotencyCollision(),
    modelBoundPolicyBypass: await modelBoundPolicyBypass(),
    directGoogleSignedEmptyText: await directGoogleSignedEmptyText(),
  }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
