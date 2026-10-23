const assert = require('node:assert/strict');
const fs = require('node:fs');
const { processCodeOutput } = require('/test/process.cjs');
const { createFileProvisionRecovery } = require('/test/operations.cjs');
const { classifyCodeArtifact } = require('/test/classify.cjs');
const extraction = require('/test/extract.cjs');
const { cancellablePdf } = require('/client.cjs');

function cacheFixture(stage, controller) {
  const cleanup = { deletes: 0, locks: 0 };
  let finishRetention = () => {};
  const retention =
    stage === 'retention'
      ? new Promise((resolve) => {
          finishRetention = resolve;
        })
      : Promise.resolve({});
  const counters = { writes: 0, commits: 0, releases: 0 };
  const deps = {
    fileStorage: {
      recovery: createFileProvisionRecovery(),
      acquireFileDeletion: async () => {
        cleanup.locks++;
        return { resumed: false };
      },
      releaseFileDeletion: async () => true,
      acquireFileProvision: async () => true,
      releaseFileProvision: async () => {
        counters.releases++;
        return true;
      },
      commitFileProvision: async () => {
        counters.commits++;
        return true;
      },
    },
    getCodeOutputFileSettings: () => ({
      endpointFileConfig: { supportedMimeTypes: [] },
      fileSizeLimit: 10485760,
    }),
    downloadCodeOutputBuffer: async () => {
      throw new Error('Must use the supplied bytes');
    },
    createDownloadFallback: () => {
      throw new Error('No successful cache fallback expected');
    },
    getRetentionExpiry: () => retention,
    convertImage: async () => {
      throw new Error('Not an image');
    },
    getStrategyFunctions: () => ({
      deleteFile: async () => {
        cleanup.deletes++;
      },
      saveBuffer: async () => {
        counters.writes++;
        if (stage === 'storage') controller.abort();
        if (stage === 'retention')
          setImmediate(() => {
            controller.abort();
            finishRetention({});
          });
        return '/owned/cache.pdf';
      },
    }),
    determineFileType: async () => ({ mime: 'application/pdf' }),
    claimCodeFile: async (input) => ({ file_id: input.file_id }),
    commitCodeFile: async () => true,
    finalizePreview: async () => {
      throw new Error('PDF must not enter the HTML preview path');
    },
    hasOfficeHtmlPath: extraction.hasOfficeHtmlPath,
    sanitizeArtifactPath: (name) => name,
    flattenArtifactPath: (name) => name,
    classifyCodeArtifact,
    extractCodeArtifactText: extraction.extractCodeArtifactText,
    getExtractedTextFormat: extraction.getExtractedTextFormat,
    getStorageMetadata: () => ({}),
    logAxiosError: () => {},
    logger: { warn() {}, debug() {} },
  };
  const run = (buffer, signal, detached = false) =>
    processCodeOutput(
      {
        req: {
          user: { id: 'fixture-user' },
          aborted: detached,
          res: { destroyed: detached, writableFinished: false },
          config: {
            fileStrategy: 'local',
            fileConfig: { extractionService: { socketPath: '/cache-socket/extraction.sock' } },
          },
        },
        id: 'fixture-file',
        name: 'cache.pdf',
        session_id: 'fixture-session',
        conversationId: 'fixture-conversation',
        messageId: 'fixture-run',
        preparedBuffer: buffer,
        signal,
      },
      deps,
    );
  return { run, counters, cleanup };
}

async function main() {
  assert.equal(
    fs.existsSync('/socket/extraction.sock'),
    false,
    'Only the custom socket may be mounted',
  );
  const success = cacheFixture();
  const output = await success.run(fs.readFileSync('/fixtures/pages.pdf'), undefined, true);
  assert.equal(output.file.text, 'First page text\nSecond page text');
  assert.equal(output.file.textFormat, 'text');
  assert.deepEqual(success.counters, { writes: 1, commits: 1, releases: 1 });
  console.log('Actual PDF cache/custom socket/closed old HTTP connection: exact text persisted');

  for (const stage of ['storage', 'retention']) {
    const owner = new AbortController();
    const ended = cacheFixture(stage, owner);
    await assert.rejects(ended.run(fs.readFileSync('/fixtures/pages.pdf'), owner.signal), {
      name: 'AbortError',
    });
    assert.deepEqual(ended.counters, { writes: 1, commits: 0, releases: 1 });
    assert.deepEqual(ended.cleanup, { locks: 1, deletes: 1 });
    console.log(`Actual PDF cache ${stage} cancellation: guarded cleanup, no metadata dispatch`);
  }

  const cancelled = cacheFixture();
  const controller = new AbortController();
  const pending = cancelled.run(cancellablePdf(), controller.signal);
  const outcome = pending.then(
    () => 'SUCCESS',
    (error) => error,
  );
  process.stdin.once('data', () => controller.abort());
  console.log('CACHE_CANCEL_PROBE_READY');
  const failure = await outcome;
  assert.equal(failure.name, 'AbortError');
  assert.deepEqual(cancelled.counters, { writes: 0, commits: 0, releases: 1 });
  console.log(
    'Actual foreground PDF cache: remote parse cancelled and drained, no byte or cache commit',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
