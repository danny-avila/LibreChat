/* Run from the repository root with current workspace builds. Exit 0 confirms the audited defect. */
process.env.MEILI_HOST = '';
process.env.MEILI_MASTER_KEY = '';
process.env.SEARCH = 'false';
const assert = require('node:assert/strict');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { setTimeout: delay } = require('node:timers/promises');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { AIMessage } = require('@langchain/core/messages');
const { NativeMediaSession } = require(path.join(
  path.dirname(require.resolve('@librechat/agents')), 'llm/google/native.cjs',
));
const { createModels, createMediaMethods, createMediaNativeMethods } = require('@librechat/data-schemas');
const { createNativeMediaFactory } = require('@librechat/api');
const { resolveMediaConfig, mediaSubmissionRequestSchema } = require('librechat-data-provider');

async function main() {
  const mongo = await MongoMemoryServer.create();
  const originalExec = mongoose.Query.prototype.exec;
  try {
    await mongoose.connect(mongo.getUri(), { autoIndex: false });
    createModels(mongoose);
    const media = createMediaMethods(mongoose);
    const native = createMediaNativeMethods(mongoose, media);
    await media.ensureMediaIndexes();
    await native.ensureMediaNativeIndexes();
    const scope = { ownerId: new mongoose.Types.ObjectId().toString(), tenantId: null };
    const integration = {
      id: 'audit-google', api: 'google.generateContent',
      endpointRef: { kind: 'builtin', endpoint: 'google' },
      catalog: { kind: 'configured', models: ['gemini-image'] }, operations: ['image.generate'],
    };
    const config = resolveMediaConfig({ enabled: true, integrations: [integration] });
    const execution = {
      connectionId: integration.id, modelId: 'gemini-image', api: integration.api,
      catalogVersion: 'native-chat', bindingRevision: 'audit-binding',
    };
    const source = { conversationId: 'audit-conversation', messageId: 'audit-message', modelRunId: 'audit-run' };
    const job = await native.startMediaNativeRecording({
      scope, execution, source,
      request: mediaSubmissionRequestSchema.parse({
        clientRequestId: 'audit-replay', operation: 'image.generate', prompt: 'Synthetic prompt',
        selection: { connectionId: integration.id, modelId: execution.modelId, catalogVersion: execution.catalogVersion },
      }),
      maxRetainers: 4, maxTitleChars: 40,
      limits: { maxParts: 100, maxPartBytes: 1024, maxRecordingBytes: 102400 },
    });
    const content = [];
    for (let index = 0; index < 24; index++) {
      const text = `Synthetic chunk ${index}`;
      const reference = await native.recordMediaNativePart({
        scope, jobId: job.jobId, chunkIndex: index, partIndex: 0,
        part: { kind: 'text', text, thoughtSignature: `synthetic-signature-${index}` }, maxRetainers: 4,
      });
      content.push({ type: 'text', text, native_media: reference });
    }
    await native.completeMediaNativeRecording({ scope, jobId: job.jobId });
    const port = await createNativeMediaFactory({
      deps: { resolveConnection: async () => ({ api: integration.api, baseURL: 'https://generativelanguage.googleapis.com/v1beta', binding: execution.bindingRevision, headers: { 'x-goog-api-key': 'synthetic-key' } }) }, repository: native,
      context: { scope, config, appConfig: { media: config }, canUse: true, canCreate: true },
      source: { ...source, messageId: 'audit-next', prompt: 'Continue', temporary: false },
    })({ provider: 'google', model: execution.modelId, apiKey: 'synthetic-key' });
    assert.ok(port);
    const session = new NativeMediaSession(port, execution.modelId, 'audit-next-run');
    const messages = [new AIMessage({ content })];
    for (const latencyMs of [0, 250]) {
      let pending = 0;
      let maximumConcurrentQueries = 0;
      const counts = {};
      mongoose.Query.prototype.exec = async function (...args) {
        const name = this.model.modelName;
        counts[name] = (counts[name] ?? 0) + 1;
        maximumConcurrentQueries = Math.max(maximumConcurrentQueries, ++pending);
        try {
          if (latencyMs) await delay(latencyMs);
          return await originalExec.apply(this, args);
        } finally { pending--; }
      };
      const start = performance.now();
      const restored = await session.messages(messages);
      const elapsedMs = Math.round(performance.now() - start);
      mongoose.Query.prototype.exec = originalExec;
      assert.equal(restored[0].content.length, content.length);
      assert.deepEqual(counts, { MediaNativePart: 24, MediaJob: 24, MediaThread: 24 });
      assert.equal(maximumConcurrentQueries, 1);
      assert.equal(restored[0].content[23].thoughtSignature, 'synthetic-signature-23');
      if (latencyMs) assert.ok(elapsedMs >= 24 * 3 * latencyMs);
      console.log(JSON.stringify({ nativeTextParts: content.length, latencyMs, queries: counts,
        maximumConcurrentQueries, elapsedMs, orderedContentAndSignaturePreserved: true }));
    }
  } finally {
    mongoose.Query.prototype.exec = originalExec;
    await mongoose.disconnect();
    await mongo.stop();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
