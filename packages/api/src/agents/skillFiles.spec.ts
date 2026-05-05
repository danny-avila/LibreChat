jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockExtract = jest.fn();
jest.mock('./run', () => ({
  extractInvokedSkillsFromPayload: (...args: unknown[]) => mockExtract(...args),
}));

import { Readable } from 'stream';
import { Types } from 'mongoose';
import { primeInvokedSkills } from './skillFiles';
import type { PrimeInvokedSkillsDeps } from './skillFiles';

const SKILL_ID = new Types.ObjectId();

function makeDeps(overrides: Partial<PrimeInvokedSkillsDeps> = {}): PrimeInvokedSkillsDeps {
  const listSkillFiles = jest.fn().mockResolvedValue([]);
  const batchUploadCodeEnvFiles = jest.fn().mockResolvedValue({
    session_id: 'session-x',
    files: [],
  });
  return {
    req: { user: { id: 'user-1' } } as PrimeInvokedSkillsDeps['req'],
    payload: [{ role: 'assistant', content: [] }],
    accessibleSkillIds: [SKILL_ID],
    codeEnvAvailable: true,
    getSkillByName: jest.fn().mockResolvedValue({
      _id: SKILL_ID,
      name: 'brand-guidelines',
      body: 'skill body',
      fileCount: 2,
    }),
    listSkillFiles,
    getStrategyFunctions: jest.fn(),
    batchUploadCodeEnvFiles,
    ...overrides,
  };
}

describe('primeInvokedSkills — execute_code capability gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExtract.mockReturnValue(new Set(['brand-guidelines']));
  });

  it('skips the batch-upload path when codeEnvAvailable is false', async () => {
    const deps = makeDeps({ codeEnvAvailable: false });

    const result = await primeInvokedSkills(deps);

    expect(result.skills?.get('brand-guidelines')).toBe('skill body');
    expect(deps.listSkillFiles).not.toHaveBeenCalled();
    expect(deps.batchUploadCodeEnvFiles).not.toHaveBeenCalled();
  });

  it('enters the batch-upload path when codeEnvAvailable is true', async () => {
    const deps = makeDeps({ codeEnvAvailable: true });

    await primeInvokedSkills(deps);

    expect(deps.listSkillFiles).toHaveBeenCalledWith(SKILL_ID);
  });

  it('calls batchUploadCodeEnvFiles without an apiKey when files are returned', async () => {
    const fileRecords = [
      {
        relativePath: 'references/style.md',
        filename: 'style.md',
        filepath: '/storage/brand-guidelines/references/style.md',
        source: 's3',
        bytes: 256,
      },
    ];
    const listSkillFiles = jest.fn().mockResolvedValue(fileRecords);
    const getStrategyFunctions = jest.fn().mockReturnValue({
      /* A real empty Readable — matches the production contract for
         `getDownloadStream` and works even if `batchUploadCodeEnvFiles`
         is later replaced with a partially-real implementation that
         iterates the stream. */
      getDownloadStream: jest.fn().mockResolvedValue(Readable.from(Buffer.from(''))),
    });
    const batchUploadCodeEnvFiles = jest.fn().mockResolvedValue({
      session_id: 'session-42',
      files: [{ fileId: 'file-1', filename: 'brand-guidelines/references/style.md' }],
    });

    const deps = makeDeps({
      codeEnvAvailable: true,
      listSkillFiles,
      getStrategyFunctions,
      batchUploadCodeEnvFiles,
    });

    await primeInvokedSkills(deps);

    expect(batchUploadCodeEnvFiles).toHaveBeenCalledTimes(1);
    const [uploadArgs] = batchUploadCodeEnvFiles.mock.calls[0];
    /* Phase 8 deprecation: LibreChat no longer threads an apiKey through
       the sandbox upload path. The agents library / sandbox service owns
       auth internally. */
    expect(uploadArgs).not.toHaveProperty('apiKey');
    expect(uploadArgs.entity_id).toBe(SKILL_ID.toString());
    /* Skill files are infrastructure inputs; the read_only flag tells codeapi
       to seal them so any sandboxed-code modifications are dropped instead
       of surfaced as ghost generated artifacts. */
    expect(uploadArgs.read_only).toBe(true);
    /* One uploaded file per `fileRecords` entry plus the synthetic
       SKILL.md that `primeSkillFiles` always prepends. */
    expect(uploadArgs.files).toHaveLength(fileRecords.length + 1);
    expect(uploadArgs.files.map((f: { filename: string }) => f.filename)).toEqual(
      expect.arrayContaining(['brand-guidelines/SKILL.md', 'brand-guidelines/references/style.md']),
    );
  });

  it('returns {} early when no skills were invoked, regardless of capability', async () => {
    mockExtract.mockReturnValue(new Set());
    const deps = makeDeps({ codeEnvAvailable: true });

    const result = await primeInvokedSkills(deps);

    expect(result).toEqual({});
    expect(deps.getSkillByName).not.toHaveBeenCalled();
  });

  it('forwards entity_id on every file in initialSessions after fresh upload', async () => {
    /* Regression: codeapi now resolves sessionKey per-file using `entity_id`.
     * Skill files must carry `entity_id=<skillId>` through priming so that
     * a subsequent execute mixing skill files and a user attachment can be
     * authorized — both files in the same call resolve to their own scope
     * instead of collapsing onto a single request-level entity. */
    const listSkillFiles = jest.fn().mockResolvedValue([
      {
        relativePath: 'references/style.md',
        filename: 'style.md',
        filepath: '/storage/brand-guidelines/references/style.md',
        source: 's3',
        bytes: 256,
      },
    ]);
    const getStrategyFunctions = jest.fn().mockReturnValue({
      getDownloadStream: jest.fn().mockResolvedValue(Readable.from(Buffer.from(''))),
    });
    const batchUploadCodeEnvFiles = jest.fn().mockResolvedValue({
      session_id: 'session-42',
      files: [{ fileId: 'file-1', filename: 'brand-guidelines/references/style.md' }],
    });

    const deps = makeDeps({
      codeEnvAvailable: true,
      listSkillFiles,
      getStrategyFunctions,
      batchUploadCodeEnvFiles,
    });

    const result = await primeInvokedSkills(deps);

    const codeSession = result.initialSessions?.get('execute_code');
    expect(codeSession?.files).toEqual([
      {
        id: 'file-1',
        name: 'brand-guidelines/references/style.md',
        session_id: 'session-42',
        entity_id: SKILL_ID.toString(),
      },
    ]);
  });

  it('awaits updateSkillFileCodeEnvIds before resolving to avoid concurrent-prime cache misses', async () => {
    /* Concurrency regression: when many users hit the same skill at
     * once, fire-and-forget keeps the cache in miss-steady-state for
     * the burst — User N's prime reads SkillFile docs before User N-1's
     * persist commits, sees no `codeEnvIdentifier`, re-uploads, and
     * fires its own forget that User N+1 also races. Awaiting the
     * persist before the prime resolves ensures the next concurrent
     * caller observes the cache pointer instead of racing a write. */
    const fileRecords = [
      {
        relativePath: 'references/style.md',
        filename: 'style.md',
        filepath: '/storage/brand-guidelines/references/style.md',
        source: 's3',
        bytes: 256,
      },
    ];
    const listSkillFiles = jest.fn().mockResolvedValue(fileRecords);
    const getStrategyFunctions = jest.fn().mockReturnValue({
      getDownloadStream: jest.fn().mockResolvedValue(Readable.from(Buffer.from(''))),
    });
    const batchUploadCodeEnvFiles = jest.fn().mockResolvedValue({
      session_id: 'session-42',
      files: [{ fileId: 'file-1', filename: 'brand-guidelines/references/style.md' }],
    });

    /* Defer resolution so we can assert the prime hasn't returned yet
     * — proves the call site is awaiting, not fire-and-forget. */
    let resolvePersist!: (v: { matchedCount: number; modifiedCount: number }) => void;
    const persistGate = new Promise<{ matchedCount: number; modifiedCount: number }>((r) => {
      resolvePersist = r;
    });
    const updateSkillFileCodeEnvIds = jest.fn().mockReturnValue(persistGate);

    const deps = makeDeps({
      codeEnvAvailable: true,
      listSkillFiles,
      getStrategyFunctions,
      batchUploadCodeEnvFiles,
      updateSkillFileCodeEnvIds,
    });

    let resolved = false;
    const primePromise = primeInvokedSkills(deps).then((r) => {
      resolved = true;
      return r;
    });

    /* Drain the microtask queue. The prime should still be pending
     * because persistGate hasn't resolved. */
    await new Promise((r) => setImmediate(r));
    expect(resolved).toBe(false);

    /* Resolve as a successful write to confirm the prime completes
     * after the persist returns. */
    resolvePersist({ matchedCount: 1, modifiedCount: 1 });
    await primePromise;

    expect(updateSkillFileCodeEnvIds).toHaveBeenCalledTimes(1);
    const [updates] = updateSkillFileCodeEnvIds.mock.calls[0];
    expect(updates).toEqual([
      {
        skillId: SKILL_ID,
        relativePath: 'references/style.md',
        codeEnvIdentifier: `session-42/file-1?entity_id=${SKILL_ID.toString()}`,
      },
    ]);
  });

  it('parses entity_id off codeEnvIdentifier in the cached-skills hot path', async () => {
    /* When all skill files are still active in codeapi, primeInvokedSkills
     * skips the batch upload entirely and reconstructs file refs from each
     * skill file's persisted `codeEnvIdentifier`. The query string carries
     * `?entity_id=<skillId>`, which must survive into `_injected_files` so
     * downstream authorization still uses the skill's scope. */
    const listSkillFiles = jest.fn().mockResolvedValue([
      {
        relativePath: 'references/style.md',
        filename: 'style.md',
        filepath: '/storage/brand-guidelines/references/style.md',
        source: 's3',
        bytes: 256,
        codeEnvIdentifier: `session-cached/file-cached?entity_id=${SKILL_ID.toString()}`,
      },
    ]);
    const batchUploadCodeEnvFiles = jest.fn();
    const deps = makeDeps({
      codeEnvAvailable: true,
      listSkillFiles,
      batchUploadCodeEnvFiles,
      getSessionInfo: jest.fn().mockResolvedValue('2026-05-05T00:00:00Z'),
      checkIfActive: jest.fn().mockReturnValue(true),
    });

    const result = await primeInvokedSkills(deps);

    expect(batchUploadCodeEnvFiles).not.toHaveBeenCalled();
    const codeSession = result.initialSessions?.get('execute_code');
    expect(codeSession?.files).toEqual([
      {
        id: 'file-cached',
        name: 'brand-guidelines/references/style.md',
        session_id: 'session-cached',
        entity_id: SKILL_ID.toString(),
      },
    ]);
  });
});
