const mockSaveBuffer = jest.fn();
const mockDeleteFile = jest.fn();
const mockGetStrategyFunctions = jest.fn();
const mockGetFileStrategy = jest.fn();
const mockGetStorageMetadata = jest.fn();
const mockResolveRequestTenantId = jest.fn();
const mockCreateDeploymentSkillMethods = jest.fn((methods) => methods);

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: (...args) => mockGetStrategyFunctions(...args),
}));

jest.mock('~/server/services/Files/Code/crud', () => ({
  batchUploadCodeEnvFiles: jest.fn(),
}));

jest.mock('~/server/services/Files/Code/process', () => ({
  getSessionInfo: jest.fn(),
  checkIfActive: jest.fn(),
  readSandboxFile: jest.fn(),
  writeSandboxFile: jest.fn(),
}));

jest.mock('@librechat/api', () => ({
  assertFileStorageLimit: (...args) => mockAssertFileStorageLimit(...args),
  recordFileStorageUsage: (...args) => mockRecordFileStorageUsage(...args),
  getSkillFileReplacementExclusion: jest.fn(({ existingFile, skillId, relativePath }) =>
    existingFile ? { skillId, relativePath } : undefined,
  ),
  checkAccess: jest.fn(),
  createDeploymentSkillMethods: (...args) => mockCreateDeploymentSkillMethods(...args),
  enrichWithSkillConfigurable: jest.fn(),
  getDeploymentSkillDownloadStream: jest.fn(),
  getStorageMetadata: (...args) => mockGetStorageMetadata(...args),
  isDeploymentSkillFileSource: jest.fn(() => false),
  mergeDeploymentSkillIds: jest.fn((ids = []) => ids),
  resolveRequestTenantId: (...args) => mockResolveRequestTenantId(...args),
}));

jest.mock('librechat-data-provider', () => ({
  AccessRoleIds: { SKILL_OWNER: 'SKILL_OWNER' },
  FileContext: { skill_file: 'skill_file' },
  PermissionBits: { EDIT: 2 },
  Permissions: { USE: 'USE', CREATE: 'CREATE' },
  PermissionTypes: { SKILLS: 'SKILLS' },
  PrincipalType: { USER: 'USER' },
  ResourceType: { SKILL: 'SKILL' },
  isEphemeralAgentId: jest.fn(() => false),
}));

jest.mock('~/server/services/PermissionService', () => ({
  checkPermission: jest.fn(),
  grantPermission: jest.fn(),
}));

jest.mock('~/server/utils/getFileStrategy', () => ({
  getFileStrategy: (...args) => mockGetFileStrategy(...args),
}));

const mockAssertFileStorageLimit = jest.fn();
const mockRecordFileStorageUsage = jest.fn();

const mockDb = {
  getSkillFileByPath: jest.fn(),
  upsertSkillFile: jest.fn(),
  getUserStorageUsage: jest.fn(),
};

jest.mock('~/models', () => mockDb);

const { getSkillToolDeps } = require('./skillDeps');

describe('skillDeps saveSkillFileContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFileStrategy.mockReturnValue('s3');
    mockGetStrategyFunctions.mockReturnValue({
      saveBuffer: mockSaveBuffer,
      deleteFile: mockDeleteFile,
    });
    mockSaveBuffer.mockResolvedValue('https://files.example.test/uploads/file.txt');
    mockDeleteFile.mockResolvedValue(undefined);
    mockGetStorageMetadata.mockReturnValue({
      storageKey: 'uploads/file.txt',
      storageRegion: 'us-east-2',
    });
    mockResolveRequestTenantId.mockReturnValue('tenant-1');
    mockDb.getSkillFileByPath.mockResolvedValue(null);
    mockAssertFileStorageLimit.mockResolvedValue(undefined);
  });

  it('cleans up the uploaded object when metadata upsert returns no row', async () => {
    mockDb.upsertSkillFile.mockResolvedValue(null);

    await expect(
      getSkillToolDeps().saveSkillFileContent({
        req: {
          user: { id: 'user-1', _id: 'user-1' },
          config: {},
        },
        skillId: 'skill-1',
        relativePath: 'references/template.html',
        content: '<html></html>',
        mimeType: 'text/html',
      }),
    ).rejects.toMatchObject({ code: 'SKILL_FILE_UPSERT_NOT_FOUND' });

    expect(mockDeleteFile).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: 'user-1' }) }),
      {
        filepath: 'https://files.example.test/uploads/file.txt',
        user: 'user-1',
        tenantId: 'tenant-1',
      },
    );
  });

  /* Agent-authored skill files write the same `SkillFile` rows the HTTP upload
   * path does, so they have to clear the same per-user quota — otherwise an
   * editable skill is an unmetered way past the cap. */
  it('charges agent-authored skill files against the storage quota', async () => {
    mockDb.upsertSkillFile.mockResolvedValue({ _id: 'skill-file-1', bytes: 13, relativePath: 'x' });

    await getSkillToolDeps().saveSkillFileContent({
      req: { user: { id: 'user-1', _id: 'user-1' }, config: {} },
      skillId: 'skill-1',
      relativePath: 'references/template.html',
      content: '<html></html>',
      mimeType: 'text/html',
    });

    expect(mockAssertFileStorageLimit).toHaveBeenCalledWith(
      expect.objectContaining({ incomingBytes: 13 }),
    );
    expect(mockRecordFileStorageUsage).toHaveBeenCalledWith(
      expect.anything(),
      13,
      expect.objectContaining({
        skillFile: expect.objectContaining({ id: 'skill-file-1', skillId: 'skill-1' }),
      }),
    );
  });

  it('rejects before writing any bytes when the author is over quota', async () => {
    const overLimit = Object.assign(new Error('storage limit exceeded.'), {
      code: 'FILE_STORAGE_LIMIT_EXCEEDED',
      status: 413,
    });
    mockAssertFileStorageLimit.mockRejectedValueOnce(overLimit);

    await expect(
      getSkillToolDeps().saveSkillFileContent({
        req: { user: { id: 'user-1', _id: 'user-1' }, config: {} },
        skillId: 'skill-1',
        relativePath: 'references/template.html',
        content: '<html></html>',
        mimeType: 'text/html',
      }),
    ).rejects.toMatchObject({ code: 'FILE_STORAGE_LIMIT_EXCEEDED' });

    expect(mockSaveBuffer).not.toHaveBeenCalled();
    expect(mockDb.upsertSkillFile).not.toHaveBeenCalled();
  });
});
