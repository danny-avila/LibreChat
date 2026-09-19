/* Diagnostic, not a fixed-behavior test: exit 0 confirms the audited defects.
 * Run from LibreChat root. Provider HTTP is intercepted; MongoDB is disposable.
 * SDK_WORKTREE may override the sibling agents-media-studio-sdk checkout. */
process.env.SEARCH = 'false';
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const schemas = require('@librechat/data-schemas');
const { createNativeMediaFactory } = require('@librechat/api');
const { resolveMediaConfig } = require('librechat-data-provider');
const root = path.resolve(__dirname, '../../../../..');
const sdkRoot = process.env.SDK_WORKTREE || path.resolve(root, '../agents-media-studio-sdk');
const fixtures = [
  { name: 'consumed-cjs', root, module: require('@librechat/agents/llm/google') },
  { name: 'sdk-head-cjs', root: sdkRoot,
    module: require(path.join(sdkRoot, 'dist/cjs/llm/google/index.cjs')) },
];
const modes = ['invoke', 'stream', 'events-v2', 'events-typed'];
let httpCalls = 0;
let responseBody;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  httpCalls++;
  const streaming = request.url.includes(':streamGenerateContent');
  return new Response(streaming ? `data: ${JSON.stringify(responseBody)}\n\n` : JSON.stringify(responseBody), {
    headers: { 'content-type': streaming ? 'text/event-stream' : 'application/json' },
  });
};
const response = (parts) => ({
  candidates: [{ index: 0, content: { role: 'model', parts }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 1290, totalTokenCount: 1301 },
});
function modelFor(fixture, nativeMedia) {
  return new fixture.module.CustomChatGoogleGenerativeAI({
    model: 'gemini-3-pro-image-preview', apiKey: 'synthetic-key', nativeMedia,
    maxRetries: 0, _lc_stream_delay: 0,
  });
}
async function consume(fixture, model, mode, callbacks) {
  const { HumanMessage } = createRequire(path.join(fixture.root, 'package.json'))('@langchain/core/messages');
  const input = [new HumanMessage('Draw')];
  const options = { callbacks };
  let result;
  if (mode === 'invoke') result = await model.invoke(input, options);
  else if (mode === 'stream') {
    for await (const chunk of await model.stream(input, options)) result = result ? result.concat(chunk) : chunk;
  } else if (mode === 'events-v2') {
    for await (const event of model.streamEvents(input, { ...options, version: 'v2' })) {
      if (event.event === 'on_chat_model_end') result = event.data.output;
    }
  } else {
    const events = model.streamEvents(input, options);
    for await (const event of events) {}
    result = await events;
  }
  return result;
}
async function observe(fixture, port, mode) {
  const before = httpCalls;
  const callbacks = { end: [], errors: [], tokens: [] };
  let output, error;
  try {
    output = await consume(fixture, modelFor(fixture, port), mode, [{
      handleLLMEnd: (value) => { callbacks.end.push(value); },
      handleLLMError: (value) => { callbacks.errors.push({ name: value.name, message: value.message }); },
      handleLLMNewToken: (_token, _idx, _run, _parent, _tags, fields) => {
        if (fields?.chunk?.message?.usage_metadata) callbacks.tokens.push(fields.chunk.message.usage_metadata);
      },
    }]);
  } catch (caught) { error = { name: caught.name, message: caught.message }; }
  return { fixture: fixture.name, mode, httpCalls: httpCalls - before,
    content: output?.content, error, callbacks };
}
async function main() {
  for (const [name, fixtureRoot, entry] of [
    ['consumed-esm', root, path.join(root, 'node_modules/@librechat/agents/dist/esm/llm/google/index.mjs')],
    ['sdk-head-esm', sdkRoot, path.join(sdkRoot, 'dist/esm/llm/google/index.mjs')],
  ]) fixtures.push({ name, root: fixtureRoot, module: await import(pathToFileURL(entry).href) });
  for (const fixture of fixtures) {
    responseBody = response([{ text: 'Should require admission' }]);
    for (const mode of modes) {
      let started = 0;
      const port = { start: async () => { started++; throw new Error('denied by host'); },
        fail: async () => {}, part: async () => { throw new Error('unreachable'); },
        complete: async () => {}, restore: async () => { throw new Error('unreachable'); } };
      const observed = await observe(fixture, port, mode);
      const bypass = fixture.name.startsWith('consumed') && mode === 'events-typed';
      assert.equal(observed.httpCalls, bypass ? 1 : 0);
      assert.equal(started, bypass ? 0 : 1);
      assert.equal(Boolean(observed.error), !bypass);
      console.log(JSON.stringify({ probe: 'entrypoint-admission', fixture: fixture.name, mode,
        protocolVersion: fixture.module.CustomChatGoogleGenerativeAI.nativeMediaProtocolVersion,
        started, httpCalls: observed.httpCalls, error: observed.error, content: observed.content }));
    }
  }
  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri(), { autoIndex: false });
    schemas.createModels(mongoose);
    const db = schemas.createMethods(mongoose);
    await db.ensureMediaIndexes();
    await db.ensureMediaNativeIndexes();
    const config = resolveMediaConfig({ enabled: true, integrations: [{
      id: 'google-native', api: 'google.generateContent',
      endpointRef: { kind: 'builtin', endpoint: 'google' },
      catalog: { kind: 'configured', models: ['gemini-3-pro-image-preview'] },
      operations: ['image.generate'],
    }] });
    for (const fixture of fixtures.filter((entry) => entry.name.endsWith('cjs'))) {
      for (const mode of ['invoke', 'stream', 'events-v2']) {
        for (const blocked of [true, false]) {
          const scope = { ownerId: new mongoose.Types.ObjectId().toString(), tenantId: null };
          const factory = createNativeMediaFactory({
            deps: { now: Date.now, storage: {}, resolveConnection: async () => ({
              api: 'google.generateContent', binding: 'synthetic-binding',
              baseURL: 'https://generativelanguage.googleapis.com', headers: { 'x-goog-api-key': 'synthetic-key' },
            }) },
            repository: db,
            context: { scope, config, appConfig: { fileStrategy: 'local' }, canUse: true, canCreate: true,
              storageReady: true, storageSources: ['local'] },
            source: { conversationId: `${scope.ownerId}-conversation`, messageId: `${scope.ownerId}-message`,
              prompt: 'Draw', temporary: false },
          });
          const host = await factory({ provider: 'google', model: 'gemini-3-pro-image-preview', apiKey: 'synthetic-key' });
          responseBody = blocked ? { promptFeedback: { blockReason: 'SAFETY' } } : response([{ text: 'Valid caption' }]);
          const observed = await observe(fixture, host, mode);
          const job = await mongoose.models.MediaJob.findOne({ ownerId: scope.ownerId }).lean();
          assert.ok(job, JSON.stringify(observed));
          assert.equal(job.phase, 'succeeded');
          assert.equal(job.outputs.length, blocked ? 0 : 1);
          console.log(JSON.stringify({ probe: 'provider-block-native-phase', fixture: fixture.name, mode,
            blocked, providerBlockReason: responseBody.promptFeedback?.blockReason,
            phase: job.phase, outputCount: job.outputs.length, error: observed.error,
            llmEndCount: observed.callbacks.end.length, llmErrorCount: observed.callbacks.errors.length }));
        }
      }
    }
  } finally { await mongoose.disconnect(); await mongo.stop(); }
  for (const fixture of fixtures.filter((entry) => entry.name.endsWith('cjs'))) {
    for (const mode of ['invoke', 'stream', 'events-v2']) {
      responseBody = response([{ inlineData: { mimeType: 'image/png', data: 'c3ludGhldGlj' } }]);
      let failure;
      const observed = await observe(fixture, {
        start: async () => ({ responseModalities: ['TEXT', 'IMAGE'] }),
        part: async () => { throw new Error('storage unavailable'); },
        complete: async () => { throw new Error('unreachable'); },
        fail: async (input) => { failure = input.reason; }, restore: async () => {},
      }, mode);
      assert.equal(observed.httpCalls, 1);
      assert.equal(failure, 'storage');
      assert.equal(observed.callbacks.end.length, 0);
      assert.equal(observed.callbacks.tokens.length, 0);
      console.log(JSON.stringify({ probe: 'storage-error-usage-boundary', fixture: fixture.name, mode,
        providerUsage: responseBody.usageMetadata, failure,
        llmEndCount: observed.callbacks.end.length, tokenUsageCallbacks: observed.callbacks.tokens.length,
        llmErrors: observed.callbacks.errors, error: observed.error }));
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { globalThis.fetch = originalFetch; });
