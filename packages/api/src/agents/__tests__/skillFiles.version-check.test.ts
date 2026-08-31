import { Types } from 'mongoose';
import type { CodeEnvRef } from 'librechat-data-provider';
import type { PrimeSkillFilesParams, SkillFileRecord } from '../skillFiles';

/** Mock the heavy dependencies so we can import primeSkillFiles without
 *  pulling in mongoose, axios, or the full protection module. */
jest.mock('@librechat/data-schemas', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false) }));

jest.mock('@librechat/agents', () => ({
  Constants: { TOOL_FILE_PREFIX: 'tool/' },
}));

jest.mock('librechat-data-provider', () => {
  const actual = {
    getCodeEnvRefForProfile: jest.fn((sf: SkillFileRecord, _routeKey?: string) => sf.codeEnvRef),
    hasActivePiiFields: jest.fn(() => false),
  };
  return { __esModule: true, ...actual, default: actual };
});

jest.mock('~/protection', () => ({
  extractFileContent: jest.fn(),
  extractSkillContent: jest.fn(),
  hasActiveFileFieldPolicy: jest.fn(() => false),
  getBlockedUninspectableSkillFileField: jest.fn(() => null),
  inspectContent: jest.fn(),
  UninspectableFileError: class extends Error {},
}));

jest.mock('~/skills/protection', () => ({
  assertSkillFileContentAllowed: jest.fn(),
}));

jest.mock('~/middleware/contentFilter', () => ({
  ContentFilterError: class extends Error {},
  isContentFilterError: jest.fn(() => false),
}));

jest.mock('../codeFilesSession', () => ({
  seedCodeFilesIntoSessions: jest.fn(),
}));

jest.mock('../compatibility', () => ({
  createSkillContentDigest: jest.fn(() => 'digest'),
}));

jest.mock('../execution', () => ({
  getCodeExecutionRouteKey: jest.fn(() => 'default'),
}));

jest.mock('../run', () => ({
  extractInvokedSkillsFromPayload: jest.fn(() => []),
}));

jest.mock('../skills', () => ({
  SKILL_FILE_PREFIX: 'skills/',
}));

jest.mock('~/utils', () => ({
  createConcurrencyLimiter: jest.fn(() => jest.fn((fn) => fn())),
  getSafeErrorMetadata: jest.fn(() => ({})),
}));

import { primeSkillFiles } from '../skillFiles';
import { getCodeEnvRefForProfile } from 'librechat-data-provider';

const mockGetCodeEnvRefForProfile = getCodeEnvRefForProfile as jest.MockedFunction<
  typeof getCodeEnvRefForProfile
>;

function makeSkill(version: number) {
  return {
    _id: new Types.ObjectId(),
    name: 'test-skill',
    body: '---\nalways-apply: false\n---\nHello',
    version,
  };
}

function makeSkillFile(refVersion: number): SkillFileRecord {
  return {
    relativePath: 'references/style.md',
    filename: 'style.md',
    filepath: 'skills/test-skill/references/style.md',
    source: 'local',
    bytes: 100,
    codeEnvRef: {
      kind: 'skill',
      id: 'skill-id',
      storage_session_id: 'session-1',
      file_id: 'file-1',
      version: refVersion,
    } as CodeEnvRef,
  };
}

describe('primeSkillFiles — version check in cache-hit path', () => {
  const mockReq = {} as PrimeSkillFilesParams['req'];
  const mockGetStrategyFunctions = jest.fn(() => ({
    getDownloadStream: jest.fn().mockResolvedValue(Readable.from(Buffer.from('content'))),
  }));
  const mockBatchUpload = jest.fn().mockResolvedValue({
    storage_session_id: 'new-session',
    files: [
      { fileId: 'new-file-1', filename: 'skills/test-skill/references/style.md' },
      { fileId: 'new-file-2', filename: 'skills/test-skill/data/schema.json' },
    ],
  });
  const mockGetSessionInfo = jest.fn().mockResolvedValue('2026-08-31T00:00:00Z');
  const mockCheckIfActive = jest.fn(() => true);
  const mockUpdateCodeEnvIds = jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reuses cached files when ref.version matches skill.version', async () => {
    const skill = makeSkill(5);
    const skillFiles = [makeSkillFile(5)];

    mockGetCodeEnvRefForProfile.mockReturnValue(skillFiles[0].codeEnvRef);

    const result = await primeSkillFiles({
      skill,
      skillFiles,
      req: mockReq,
      getStrategyFunctions: mockGetStrategyFunctions,
      batchUploadCodeEnvFiles: mockBatchUpload,
      getSessionInfo: mockGetSessionInfo,
      checkIfActive: mockCheckIfActive,
      updateSkillFileCodeEnvIds: mockUpdateCodeEnvIds,
    });

    expect(result).not.toBeNull();
    expect(result!.files).toHaveLength(1);
    expect(result!.files[0].storage_session_id).toBe('session-1');
    expect(result!.files[0].version).toBe(5);
    expect(mockBatchUpload).not.toHaveBeenCalled();
  });

  it('re-uploads when ref.version is stale (SKILL.md edit bumped version)', async () => {
    const skill = makeSkill(7);
    const skillFiles = [makeSkillFile(4)]; // stale: ref says v4, skill is v7

    mockGetCodeEnvRefForProfile.mockReturnValue(skillFiles[0].codeEnvRef);

    const result = await primeSkillFiles({
      skill,
      skillFiles,
      req: mockReq,
      getStrategyFunctions: mockGetStrategyFunctions,
      batchUploadCodeEnvFiles: mockBatchUpload,
      getSessionInfo: mockGetSessionInfo,
      checkIfActive: mockCheckIfActive,
      updateSkillFileCodeEnvIds: mockUpdateCodeEnvIds,
    });

    expect(result).not.toBeNull();
    expect(mockBatchUpload).toHaveBeenCalledTimes(1);
    expect(mockGetSessionInfo).not.toHaveBeenCalled();
  });

  it('re-uploads when any one ref has a stale version', async () => {
    const skill = makeSkill(15);
    const freshFile = makeSkillFile(15);
    const staleFile = { ...makeSkillFile(14), relativePath: 'data/schema.json' };
    const skillFiles = [freshFile, staleFile];

    mockGetCodeEnvRefForProfile.mockImplementation(
      (sf: SkillFileRecord, _routeKey?: string) => sf.codeEnvRef,
    );

    const result = await primeSkillFiles({
      skill,
      skillFiles,
      req: mockReq,
      getStrategyFunctions: mockGetStrategyFunctions,
      batchUploadCodeEnvFiles: mockBatchUpload,
      getSessionInfo: mockGetSessionInfo,
      checkIfActive: mockCheckIfActive,
      updateSkillFileCodeEnvIds: mockUpdateCodeEnvIds,
    });

    expect(result).not.toBeNull();
    expect(mockBatchUpload).toHaveBeenCalledTimes(1);
    expect(mockGetSessionInfo).not.toHaveBeenCalled();
  });
});

import { Readable } from 'stream';
