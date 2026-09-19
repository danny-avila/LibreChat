/* Run from repository root: node docs/research/media-studio/audit/probes/authorization.cjs */
const assert = require('node:assert/strict');
process.env.CREDS_KEY = '12'.repeat(32);
process.env.CREDS_IV = '34'.repeat(16);
process.env.MEILI_HOST = '';
process.env.MEILI_MASTER_KEY = '';
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  createModels, createMethods, createMediaMethods, createMediaNativeMethods, decrypt,
} = require('@librechat/data-schemas');
const { createMediaCredentialResolver, createNativeMediaFactory } = require('@librechat/api');
const { resolveMediaConfig, mediaSubmissionRequestSchema } = require('librechat-data-provider');

async function main() {
  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri());
    createModels(mongoose);
    const media = createMediaMethods(mongoose);
    const native = createMediaNativeMethods(mongoose, media);
    const keys = createMethods(mongoose);
    await media.ensureMediaIndexes();
    await native.ensureMediaNativeIndexes();
    const scope = { ownerId: new mongoose.Types.ObjectId().toString(), tenantId: null };
    const integration = {
      id: 'google', api: 'google.generateContent',
      endpointRef: { kind: 'builtin', endpoint: 'google' },
      catalog: { kind: 'configured', models: ['gemini-image'] },
      operations: ['image.generate'],
    };
    const appConfig = { media: resolveMediaConfig({ enabled: true, integrations: [integration] }) };
    const resolve = createMediaCredentialResolver({
      environment: { GOOGLE_KEY: 'user_provided' }, repository: media, decrypt, now: Date.now,
    });
    const connection = () => resolve({ scope, integration, appConfig, minValidityMs: 60_000 });
    const expiry = new Date(Date.now() + 86_400_000).toISOString();
    const secret = 'synthetic-google-key';
    const save = (value, expiresAt = expiry) => keys.updateUserKey({
      userId: scope.ownerId, name: 'google', value: JSON.stringify(value), expiresAt,
    });
    await save({ GOOGLE_API_KEY: secret });
    const original = await connection();
    const execution = {
      connectionId: integration.id, api: integration.api, modelId: 'gemini-image',
      catalogVersion: 'native-chat', bindingRevision: original.binding,
    };
    const job = await native.startMediaNativeRecording({
      scope, execution,
      source: { conversationId: 'synthetic-conversation', messageId: 'synthetic-message', modelRunId: 'synthetic-run' },
      request: mediaSubmissionRequestSchema.parse({
        clientRequestId: 'synthetic-request', operation: 'image.generate', prompt: 'Synthetic request',
        selection: { connectionId: integration.id, modelId: execution.modelId, catalogVersion: execution.catalogVersion },
      }),
      maxRetainers: 4, maxTitleChars: 40,
      limits: { maxParts: 20, maxPartBytes: 1024, maxRecordingBytes: 4096 },
    });
    const reference = await native.recordMediaNativePart({
      scope, jobId: job.jobId, chunkIndex: 0, partIndex: 0,
      part: { kind: 'text', text: 'Synthetic native response', thoughtSignature: 'synthetic-signature' },
      maxRetainers: 4,
    });
    await native.completeMediaNativeRecording({ scope, jobId: job.jobId });
    const restore = (resolved, owner = scope) => native.getMediaNativeContinuation({
      scope: owner, execution: { ...execution, bindingRevision: resolved.binding },
      continuationRef: reference.continuationRef,
    });
    const nativePort = () => createNativeMediaFactory({
      deps: { resolveConnection: resolve }, repository: native,
      context: { scope, appConfig, config: appConfig.media, canUse: true, canCreate: true },
      source: { conversationId: 'synthetic-conversation', messageId: 'next-message', prompt: 'Continue', temporary: false },
    })({ provider: 'google', model: 'gemini-image', apiKey: secret });
    assert.ok(await restore(original));
    assert.equal((await (await nativePort()).restore(reference)).kind, 'text');
    assert.equal(await restore(original, { ...scope, ownerId: new mongoose.Types.ObjectId().toString() }), null);
    assert.equal(await restore(original, { ...scope, tenantId: 'different-tenant' }), null);
    await save({ GOOGLE_API_KEY: secret });
    assert.equal((await connection()).binding, original.binding);
    await save({ GOOGLE_API_KEY: secret }, new Date(Date.now() + 2 * 86_400_000).toISOString());
    const extended = await connection();
    assert.deepEqual(extended.headers, original.headers);
    assert.notEqual(extended.binding, original.binding);
    assert.equal(await restore(extended), null);
    await assert.rejects((await nativePort()).restore(reference), (error) => error.code === 'not_found');
    await save({ GOOGLE_API_KEY: secret });
    assert.ok(await restore(await connection()));
    await save({ GOOGLE_API_KEY: secret, GOOGLE_SERVICE_KEY: JSON.stringify({
      type: 'service_account', client_email: 'synthetic@example.com', project_id: 'synthetic-project',
      private_key: 'synthetic-key'.repeat(60),
    }) });
    const merged = await connection();
    assert.deepEqual(merged.headers, original.headers);
    assert.notEqual(merged.binding, original.binding);
    assert.equal(await restore(merged), null);
    await assert.rejects((await nativePort()).restore(reference), (error) => error.code === 'not_found');
    await save({ GOOGLE_API_KEY: 'synthetic-other-account' });
    assert.equal(await restore(await connection()), null);
    await keys.deleteUserKey({ userId: scope.ownerId, name: 'google' });
    await assert.rejects(connection(), (error) => error.code === 'credentials_required');
    console.log(JSON.stringify({
      actualMongo: true,
      nativeContinuationInitiallyRestores: true,
      exactResavePreservesBinding: true,
      expiryExtensionChangesBindingWithIdenticalProviderHeaders: true,
      expiryExtensionMakesNativeContinuationUnavailable: true,
      nativeFactoryRestoreReturnsNotFoundAfterMetadataChanges: true,
      unrelatedGoogleServiceFieldChangesBindingWithIdenticalProviderHeaders: true,
      unrelatedGoogleServiceFieldMakesNativeContinuationUnavailable: true,
      crossOwnerAndCrossTenantRejected: true,
      changedAPIKeyAndDeletedKeyRejected: true,
    }, null, 2));
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
