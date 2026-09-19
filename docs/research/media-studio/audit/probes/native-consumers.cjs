/* Diagnostic probes for the audited head. Exit 0 confirms the described defects, not a fix.
 * Run from repository root: node docs/research/media-studio/audit/probes/native-consumers.cjs
 * Uses disposable MongoDB, actual message-edit route, installed SDK replay, and native methods.
 * Authentication middleware is supplied a synthetic owner; no provider calls are made. */
process.env.SEARCH = 'false';
process.env.MEILI_HOST = '';
process.env.MEILI_MASTER_KEY = '';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const schemas = require('@librechat/data-schemas');
const api = require('@librechat/api');
const { mediaSubmissionRequestSchema } = require('librechat-data-provider');
const { AIMessage } = require('@langchain/core/messages');
const { NativeMediaSession } = require(path.join(
  path.dirname(require.resolve('@librechat/agents')), 'llm/google/native.cjs'));

const root = path.resolve(__dirname, '../../../../..');
function sourceModule(relative, dependencies) {
  const filename = path.join(root, relative);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.require = (name) => Object.hasOwn(dependencies, name)
    ? dependencies[name] : Module.prototype.require.call(loaded, name);
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  return loaded.exports;
}
const pass = (_req, _res, next) => next();

async function main() {
  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri(), { autoIndex: false });
    schemas.createModels(mongoose);
    const db = schemas.createMethods(mongoose);
    await db.ensureMediaIndexes();
    await db.ensureMediaNativeIndexes();
    const scope = { ownerId: new mongoose.Types.ObjectId().toString(), tenantId: null };
    const execution = { api: 'google.generateContent', modelId: 'gemini-image',
      connectionId: 'google', catalogVersion: 'v1', bindingRevision: 'audit-account' };
    const job = await db.startMediaNativeRecording({
      scope, source: { conversationId: 'native-conversation', messageId: 'native-message', modelRunId: 'native-run' },
      request: mediaSubmissionRequestSchema.parse({ clientRequestId: 'native-request',
        prompt: 'Create an image and caption', operation: 'image.generate',
        selection: { connectionId: execution.connectionId, modelId: execution.modelId, catalogVersion: execution.catalogVersion } }),
      execution, maxRetainers: 10, maxTitleChars: 100,
      limits: { maxParts: 10, maxPartBytes: 1024, maxRecordingBytes: 4096 },
    });
    const originalText = 'Original caption before correction';
    const reference = await db.recordMediaNativePart({ scope, jobId: job.jobId,
      chunkIndex: 0, partIndex: 0,
      part: { kind: 'text', text: originalText, thoughtSignature: 'private-synthetic-signature' },
      maxRetainers: 10 });
    await db.completeMediaNativeRecording({ scope, jobId: job.jobId });
    const original = { user: scope.ownerId, conversationId: 'native-conversation',
      messageId: 'native-message', parentMessageId: '00000000-0000-0000-0000-000000000000',
      endpoint: 'google', model: 'gemini-image', sender: 'Gemini', isCreatedByUser: false,
      createdAt: new Date(), updatedAt: new Date(), content: [{ type: 'text', text: originalText, native_media: reference }] };
    await mongoose.models.Message.collection.insertOne(original);
    await mongoose.models.Conversation.collection.insertOne({
      user: scope.ownerId, conversationId: original.conversationId, title: 'Native source',
    });

    const router = sourceModule('api/server/routes/messages.js', {
      '~/models': db,
      '~/server/services/Endpoints/agents/subagentThreadStore': { isThreadActiveForOwner: () => false },
      '~/server/services/Artifacts/update': {},
      '~/server/middleware': { requireJwtAuth: pass, validateMessageReq: pass,
        configMiddleware: pass, prepareMessageRequestValidation: pass },
    });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: scope.ownerId }; req.config = {}; next(); });
    app.use('/api/messages', router);
    const editedText = 'Corrected caption visible to the user';
    const response = await request(app)
      .put('/api/messages/native-conversation/native-message')
      .send({ index: 0, text: editedText, model: 'gemini-image' });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const stored = await mongoose.models.Message.findOne({ messageId: original.messageId }).lean();
    assert.equal(stored.content[0].text, editedText);
    assert.deepEqual(stored.content[0].native_media, reference);
    const port = { async restore(input) {
      const found = await db.getMediaNativeContinuation({ scope, execution,
        continuationRef: input.continuationRef, fileId: input.file_id });
      if (!found) throw new Error('Native continuation unavailable');
      return found.part;
    } };
    const replay = new NativeMediaSession(port, execution.modelId);
    const { formatAgentMessages } = sourceModule('api/app/clients/prompts/formatMessages.js', {});
    const [replayed] = await replay.messages(formatAgentMessages([{ role: 'assistant', content: stored.content }]));
    assert.equal(replayed.content[0].text, originalText);
    const [ordinary] = await replay.messages([new AIMessage({ content: [{ type: 'text', text: editedText }] })]);
    assert.equal(ordinary.content[0].text, editedText);
    console.log(JSON.stringify({ probe: 'assistant-edit-replays-old-native-text', httpStatus: response.status,
      visibleText: stored.content[0].text, providerReplayText: replayed.content[0].text,
      ordinaryTextControl: ordinary.content[0].text,
      privateSignatureInStoredMessage: JSON.stringify(stored.content).includes('private-synthetic-signature') }));

    const { cloneMessagesWithTimestamps } = sourceModule('api/server/utils/import/fork.js', {
      '~/models': db, './importBatchBuilder': {}, '~/server/services/Config': {},
      './defaults': {}, '~/app/clients/BaseClient': {},
    });
    const clones = [];
    cloneMessagesWithTimestamps([stored], { saveMessage: (message) => clones.push(message) });
    assert.notEqual(clones[0].messageId, stored.messageId);
    assert.deepEqual(clones[0].content[0].native_media, reference);
    await mongoose.models.Message.collection.insertOne({ ...clones[0], _id: new mongoose.Types.ObjectId(),
      conversationId: 'native-fork' });
    const cloneReplayBefore = await replay.messages([new AIMessage({ content: clones[0].content })]);
    assert.equal(cloneReplayBefore[0].content[0].text, originalText);
    const importOwner = new mongoose.Types.ObjectId().toString();
    const { getImporter } = sourceModule('api/server/utils/import/importers.js', {
      '~/server/services/Config': { getEndpointsConfig: async () => ({ google: {} }) },
      './importBatchBuilder': {}, './defaults': { resolveImportDefaultModel: async () => execution.modelId },
      './fork': { cloneMessagesWithTimestamps },
    });
    const imported = [];
    const exported = JSON.parse(JSON.stringify({ conversationId: original.conversationId,
      title: 'Native export', endpoint: 'google', recursive: false, messages: [stored] }));
    await getImporter(exported)(exported, importOwner, () => ({
      startConversation: () => {}, saveMessage: (message) => imported.push(message),
      finishConversation: () => {}, saveBatch: async () => {},
    }));
    assert.equal(imported[0].isUserSubmitted, true);
    assert.deepEqual(imported[0].content[0].native_media, reference);
    const otherOwner = await db.getMediaNativeContinuation({
      scope: { ...scope, ownerId: importOwner }, execution,
      continuationRef: reference.continuationRef });
    assert.equal(otherOwner, null);
    let importReplayError;
    const importReplay = new NativeMediaSession({ async restore(input) {
      const found = await db.getMediaNativeContinuation({ scope: { ...scope, ownerId: importOwner },
        execution, continuationRef: input.continuationRef });
      if (!found) throw new Error('Native continuation unavailable');
      return found.part;
    } }, execution.modelId);
    try { await importReplay.messages([new AIMessage({ content: imported[0].content })]); }
    catch (error) { importReplayError = error.message; }
    assert.equal(importReplayError, 'Native continuation unavailable');
    console.log(JSON.stringify({ probe: 'import-retains-unrestorable-owner-bound-native-text',
      importedAsUserSubmitted: imported[0].isUserSubmitted,
      retainedForeignContinuationRef: true, ownerScopedReplayError: importReplayError,
      privateSignatureInExport: JSON.stringify(exported).includes('private-synthetic-signature') }));
    await db.retireMediaThread(scope, job.threadId);
    const sourceStillExists = await mongoose.models.Message.exists({ messageId: original.messageId });
    const cloneStillExists = await mongoose.models.Message.exists({ messageId: clones[0].messageId });
    let restoreError;
    try { await replay.messages([new AIMessage({ content: clones[0].content })]); }
    catch (error) { restoreError = error.message; }
    assert.equal(restoreError, 'Native continuation unavailable');
    console.log(JSON.stringify({ probe: 'studio-retirement-invalidates-live-chat-and-fork',
      sourceMessageExists: !!sourceStillExists, forkMessageExists: !!cloneStillExists,
      forkRetainsOriginalContinuationReference: true, replayBeforeRetirement: true,
      replayAfterRetirement: restoreError, otherOwnerControl: otherOwner }));
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
