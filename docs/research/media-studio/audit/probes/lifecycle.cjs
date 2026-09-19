/* Isolated audit reproductions. No live provider, cloud, or application database access. */
process.env.SEARCH = 'false';
process.env.MEILI_HOST = '';
process.env.MEILI_MASTER_KEY = '';
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  createModels, createMethods, createMediaMethods, createMediaNativeMethods, runAsSystem,
} = require('@librechat/data-schemas');
const {
  createMediaStorage, createLocalMediaObjectStore, deleteMediaAwareFile,
  createMediaWorker, toPublicFiles,
} = require('@librechat/api');
const { mediaSubmissionRequestSchema, resolveMediaConfig } = require('librechat-data-provider');

const results = [];
let mongo, directory, media, native, methods, worker;
const options = { maxRetainers: 4, maxTitleChars: 100, temporaryRetentionMs: 60_000 };
const owner = (n) => ({ ownerId: n.toString(16).padStart(24, '0'), tenantId: null });
const execution = {
  api: 'openai.images', connectionId: 'images', modelId: 'gpt-image-1',
  catalogVersion: 'fixture', bindingRevision: 'fixture', accountingMode: 'none',
};
async function reset() {
  await worker?.stop();
  worker = undefined;
  await Promise.all(Object.values(mongoose.models).map((model) => model.collection.deleteMany({})));
}
async function stage(scope, key, extra = {}) {
  return media.stageMediaSubmission({
    scope, maxActiveJobs: 10, maxPendingTotal: 100, execution,
    request: mediaSubmissionRequestSchema.parse({
      clientRequestId: key, operation: 'image.generate', prompt: `private prompt ${key}`,
      selection: { connectionId: 'images', modelId: 'gpt-image-1', catalogVersion: 'fixture' },
      ...extra,
    }),
  });
}
async function original(scope, key, { derivatives = true, expiredAt } = {}) {
  const storageKey = `images/${scope.ownerId}/${key}.png`;
  const location = { source: 'local', storageKey, filepath: `/${storageKey}` };
  const thumbnail = {
    source: 'local', storageKey: `${storageKey}.thumbnail.png`,
    filepath: `/${storageKey}.thumbnail.png`, type: 'image/png', bytes: 8,
    contentDigest: 'synthetic-thumbnail', width: 2, height: 2,
  };
  const write = await media.reserveMediaAssetWrite({
    scope, outputKey: key, rendition: 'original', ingestToken: key,
    fingerprint: key, ...location,
    ...(derivatives ? { renditionLocations: [{ ...thumbnail, kind: 'thumbnail' }] } : {}),
  });
  for (const item of [location, ...(derivatives ? [thumbnail] : [])]) {
    const physical = path.join(directory, item.storageKey);
    await fs.mkdir(path.dirname(physical), { recursive: true });
    await fs.writeFile(physical, 'synthetic-bytes');
  }
  const asset = await media.commitMediaAssetWrite({
    scope, writeId: write.writeId,
    content: {
      ...location, file_id: write.fileId, filename: `${key}.png`, type: 'image/png',
      bytes: 15, contentDigest: key, ...(expiredAt ? { expiredAt } : {}),
      ...(derivatives ? { mediaRenditions: { thumbnail } } : {}),
    },
  });
  return { asset, write, location, thumbnail };
}
const exists = async (key) => fs.stat(path.join(directory, key)).then(() => true, () => false);
function storage(stores = []) {
  return createMediaStorage({
    repository: media, imageDirectory: path.join(directory, 'images'),
    uploadDirectory: path.join(directory, 'uploads'), now: Date.now, stores,
  });
}
async function until(predicate, description, timeout = 5_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out: ${description}`);
}
async function run() {
  mongo = await MongoMemoryServer.create({ instance: { args: ['--setParameter', 'ttlMonitorSleepSecs=1'] } });
  await mongoose.connect(mongo.getUri());
  createModels(mongoose);
  methods = createMethods(mongoose);
  media = createMediaMethods(mongoose);
  native = createMediaNativeMethods(mongoose, media);
  await Promise.all([media.ensureMediaIndexes(), native.ensureMediaNativeIndexes()]);
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'librechat-lifecycle-audit-'));

  // A. Real filesystem deletion via the legacy wrapper versus shared storage lifecycle.
  await reset();
  const scope = owner(1);
  const legacy = await original(scope, 'legacy');
  const local = createLocalMediaObjectStore({
    imageDirectory: path.join(directory, 'images'), uploadDirectory: path.join(directory, 'uploads'),
  });
  let deleteCalls = 0;
  await deleteMediaAwareFile({
    request: { user: { id: scope.ownerId } }, file: legacy.asset, repository: media,
    deleteFile: async (_request, content) => { deleteCalls++; await local.remove(scope, content); },
  });
  const retired = await mongoose.models.File.findOne({ file_id: legacy.asset.file_id }).lean();
  const files = toPublicFiles(await methods.getFiles({ user: scope.ownerId }));
  const expired = await media.listMediaExpiredAssets({ scope, now: new Date().toISOString(), limit: 10 });
  const content = await media.getMediaAssetContent(scope, legacy.asset.file_id);
  const control = await original(scope, 'shared-control');
  await storage().remove(scope, control.asset.file_id);
  assert.equal(await exists(legacy.location.storageKey), false);
  assert.equal(await exists(legacy.thumbnail.storageKey), true);
  assert.equal(retired.mediaLifecycle, 'retired');
  assert.equal(expired.length, 0);
  assert.equal(content, null);
  assert.equal(files.some((file) => file.file_id === legacy.asset.file_id), true);
  assert.equal(await exists(control.thumbnail.storageKey), false);
  results.push({ probe: 'legacy-delete-versus-shared-storage', deleteCalls,
    legacyOriginalExists: false, legacyThumbnailExists: true, lifecycle: retired.mediaLifecycle,
    cleanupCandidates: expired.length, publicListContainsDeletedFile: true, contentAvailable: false,
    sharedStorageControlThumbnailExists: false });

  // B. Crash after staging: identical temporary request loses retention during recovery.
  await reset();
  const direct = await stage(scope, 'temporary-direct', { temporary: true });
  await media.publishMediaSubmission(scope, direct.jobId, options);
  const interrupted = await stage(scope, 'temporary-recovered', { temporary: true });
  await media.recoverMediaPublications({ scope, limit: 10, ...options });
  const directThread = await media.getMediaThread(scope, direct.threadId);
  const recoveredThread = await media.getMediaThread(scope, interrupted.threadId);
  assert.ok(directThread.expiresAt);
  assert.equal(recoveredThread.expiresAt, undefined);
  const future = new Date(Date.now() + 120_000).toISOString();
  await media.retireExpiredMediaThreads({ scope, now: future, limit: 10 });
  await media.reconcileMediaRetirements({ scope, limit: 10 });
  const rawDirect = await mongoose.models.MediaThread.findOne({ threadId: direct.threadId }).lean();
  const rawJob = await media.getMediaJob(scope, direct.jobId);
  const rawTurn = await mongoose.models.MediaTurn.findOne({ turnId: direct.turnId }).lean();
  assert.equal(rawDirect.status, 'retired');
  assert.equal(rawJob.request.prompt, 'private prompt temporary-direct');
  assert.equal(rawTurn.prompt, 'private prompt temporary-direct');
  results.push({ probe: 'temporary-publication-crash-and-expiry', directExpiresAt: directThread.expiresAt,
    recoveredExpiresAt: recoveredThread.expiresAt ?? null,
    recoveredStillActiveAfterDeadline: !!(await media.getMediaThread(scope, interrupted.threadId)),
    expiredThreadRawStatus: rawDirect.status, retainedTitle: rawDirect.title,
    retainedJobPrompt: rawJob.request.prompt, retainedTurnPrompt: rawTurn.prompt,
    expiredThreadPubliclyAvailable: !!(await media.getMediaThread(scope, direct.threadId)) });

  // C. Normal completed native deletion retains all private content; expired native parts have a TTL.
  await reset();
  const nativeExecution = { ...execution, api: 'google.generateContent', modelId: 'gemini-image' };
  async function startNative(key, expiresAt) {
    return native.startMediaNativeRecording({
      scope, source: { conversationId: 'synthetic-conversation', messageId: key, modelRunId: key,
        ...(expiresAt ? { expiresAt } : {}) },
      request: mediaSubmissionRequestSchema.parse({
        clientRequestId: key, operation: 'image.generate', prompt: `private native prompt ${key}`,
        selection: { connectionId: 'images', modelId: 'gemini-image', catalogVersion: 'fixture' },
      }),
      execution: nativeExecution, ...options,
      limits: { maxParts: 20, maxPartBytes: 1024, maxRecordingBytes: 4096 },
    });
  }
  const completed = await startNative('native-completed');
  const part = await native.recordMediaNativePart({
    scope, jobId: completed.jobId, chunkIndex: 0, partIndex: 0, maxRetainers: 4,
    part: { kind: 'text', text: 'private generated text', thoughtSignature: 'private-signature' },
  });
  await native.completeMediaNativeRecording({ scope, jobId: completed.jobId });
  await media.retireMediaThread(scope, completed.threadId);
  await media.reconcileMediaRetirements({ scope, limit: 10 });
  await media.reconcileMediaRetirements({ scope, limit: 10 });
  const deletedJob = await media.getMediaJob(scope, completed.jobId);
  const deletedPart = await mongoose.models.MediaNativePart.findOne({ continuationRef: part.continuationRef }).lean();
  assert.equal(deletedPart.part.thoughtSignature, 'private-signature');
  assert.equal(deletedJob.outputs[0].text, 'private generated text');
  const crash = await startNative('native-crashed');
  const nativeFuture = new Date(Date.now() + 60_000).toISOString();
  await native.reconcileMediaNativeRecordings({ scope, staleBefore: nativeFuture, now: nativeFuture, limit: 10 });
  await media.retireMediaThread(scope, crash.threadId);
  await media.reconcileMediaRetirements({ scope, limit: 10 });
  const stranded = await media.getMediaJob(scope, crash.jobId);
  const strandedThread = await mongoose.models.MediaThread.findOne({ threadId: crash.threadId }).lean();
  const deletionPrepared = await media.prepareMediaAccountDeletion({ scope, token: 'probe-delete' });
  assert.equal(stranded.phase, 'requires_attention');
  assert.equal(strandedThread.status, 'retiring');
  assert.equal(deletionPrepared, false);
  await media.cancelMediaAccountDeletion({ scope, token: 'probe-delete' });
  const expiring = await startNative('native-ttl', new Date(Date.now() + 500).toISOString());
  await native.recordMediaNativePart({
    scope, jobId: expiring.jobId, chunkIndex: 0, partIndex: 0, maxRetainers: 4,
    part: { kind: 'text', text: 'short-lived native part' },
  });
  await native.completeMediaNativeRecording({ scope, jobId: expiring.jobId });
  await until(async () => (await mongoose.models.MediaNativePart.countDocuments({ jobId: expiring.jobId })) === 0,
    'native part TTL removal', 8_000);
  const expiredNativeView = await media.getMediaJobView(scope, expiring.jobId);
  assert.equal(expiredNativeView.outputs[0].text, 'short-lived native part');
  results.push({ probe: 'native-retirement-and-crash', retiredGeneratedText: deletedJob.outputs[0].text,
    retiredPrivateSignature: deletedPart.part.thoughtSignature,
    crashedPhase: stranded.phase, crashedThreadStatus: strandedThread.status,
    accountDeletionPrepared: deletionPrepared,
    nativePermits: await mongoose.models.MediaPermit.countDocuments(),
    explicitSourceExpiryNativePartTTLWorked: true,
    expiredNativeTextStillPubliclyAvailable: expiredNativeView.outputs[0].text });

  // D. A persistent storage failure blocks actual worker dispatch for an unrelated owner.
  await reset();
  const poison = await original(owner(1), 'poison', { derivatives: false, expiredAt: new Date(0).toISOString() });
  const receipt = await stage(owner(2), 'unrelated-generation');
  await media.publishMediaSubmission(owner(2), receipt.jobId, options);
  const config = resolveMediaConfig({ enabled: true, integrations: [{
    id: 'images', api: 'openai.images', endpointRef: { kind: 'custom', name: 'Fixture' },
    catalog: { kind: 'configured', models: ['gpt-image-1'] }, operations: ['image.generate'],
  }] });
  config.worker.tickMs = 10;
  let failDelete = true, cleanupAttempts = 0, providerSubmissions = 0, settlements = 0;
  const errors = [];
  const actualStorage = storage([{ ...local, remove: async (assetScope, location) => {
    if (location.storageKey === poison.location.storageKey) {
      cleanupAttempts++;
      if (failDelete) throw new Error('synthetic persistent storage DELETE failure');
    }
    await local.remove(assetScope, location);
  } }]);
  worker = createMediaWorker({
    repository: media, storage: actualStorage, now: Date.now, id: () => 'lifecycle-probe-worker',
    adapters: [{ api: 'openai.images', submit: async () => {
      providerSubmissions++;
      return { status: 'completed', parts: [{ kind: 'text', text: 'synthetic result', ordinal: 0 }] };
    } }],
    loadContext: async (requestScope) => ({ scope: requestScope, config, canUse: true, canCreate: true,
      appConfig: { transactions: { enabled: false }, media: config } }),
    resolveConnection: async () => ({ binding: 'fixture' }),
    withScope: async (_requestScope, operation) => operation(), asSystem: runAsSystem,
    accounting: { reserve: async () => {}, release: async () => {}, settle: async () => { settlements++; } },
    log: (error) => errors.push(error.message),
  }, { prepare: async () => ({ inputs: [] }) }, config);
  await worker.start();
  await until(() => cleanupAttempts >= 3, 'three poisoned maintenance ticks');
  const blockedJob = await media.getMediaJob(owner(2), receipt.jobId);
  const blocked = { cleanupAttempts, phase: blockedJob.phase, providerSubmissions, settlements };
  assert.equal(blockedJob.phase, 'queued');
  assert.equal(providerSubmissions, 0);
  failDelete = false;
  await until(async () => (await media.getMediaJob(owner(2), receipt.jobId)).phase === 'succeeded',
    'dispatch and settlement after removing poison');
  await worker.stop();
  results.push({ probe: 'poison-cleanup-isolation', whileDeleteFailing: blocked,
    afterDeleteRecovers: { phase: 'succeeded', providerSubmissions, settlements },
    workerScanErrors: errors.filter((message) => message === 'The media worker could not scan pending work.').length });
}
run().then(() => { console.log(JSON.stringify({ results }, null, 2)); }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await worker?.stop();
  await mongoose.disconnect();
  await mongo?.stop();
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});
