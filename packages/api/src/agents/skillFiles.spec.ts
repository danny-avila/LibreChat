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
  const ORIGINAL_KEY = process.env.LIBRECHAT_CODE_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExtract.mockReturnValue(new Set(['brand-guidelines']));
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.LIBRECHAT_CODE_API_KEY;
    } else {
      process.env.LIBRECHAT_CODE_API_KEY = ORIGINAL_KEY;
    }
  });

  it('skips the batch-upload path when codeEnvAvailable is false (even if env key is set)', async () => {
    process.env.LIBRECHAT_CODE_API_KEY = 'present';
    const deps = makeDeps({ codeEnvAvailable: false });

    const result = await primeInvokedSkills(deps);

    expect(result.skills?.get('brand-guidelines')).toBe('skill body');
    expect(deps.listSkillFiles).not.toHaveBeenCalled();
    expect(deps.batchUploadCodeEnvFiles).not.toHaveBeenCalled();
  });

  it('skips the batch-upload path when codeEnvAvailable is true but env key is unset', async () => {
    delete process.env.LIBRECHAT_CODE_API_KEY;
    const deps = makeDeps({ codeEnvAvailable: true });

    const result = await primeInvokedSkills(deps);

    expect(result.skills?.get('brand-guidelines')).toBe('skill body');
    expect(deps.listSkillFiles).not.toHaveBeenCalled();
    expect(deps.batchUploadCodeEnvFiles).not.toHaveBeenCalled();
  });

  it('enters the batch-upload path when codeEnvAvailable is true and env key is set', async () => {
    process.env.LIBRECHAT_CODE_API_KEY = 'present';
    const deps = makeDeps({ codeEnvAvailable: true });

    await primeInvokedSkills(deps);

    expect(deps.listSkillFiles).toHaveBeenCalledWith(SKILL_ID);
  });

  it('actually calls batchUploadCodeEnvFiles with the env-sourced apiKey when files are returned', async () => {
    process.env.LIBRECHAT_CODE_API_KEY = 'sk-from-env';
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
    const readable = {
      on: jest.fn(),
      pipe: jest.fn(),
      read: jest.fn(),
    } as unknown as NodeJS.ReadableStream;
    const getStrategyFunctions = jest.fn().mockReturnValue({
      getDownloadStream: jest.fn().mockResolvedValue(readable),
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
    expect(uploadArgs.apiKey).toBe('sk-from-env');
    expect(uploadArgs.entity_id).toBe(SKILL_ID.toString());
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
