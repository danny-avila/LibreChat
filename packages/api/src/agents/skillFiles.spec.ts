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
});
