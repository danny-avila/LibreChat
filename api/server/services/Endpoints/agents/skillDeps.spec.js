const mockSaveBuffer = jest.fn();
const mockDeleteFile = jest.fn();
const mockGetStrategyFunctions = jest.fn();
const mockGetFileStrategy = jest.fn();
const mockGetStorageMetadata = jest.fn();
const mockResolveRequestTenantId = jest.fn();
const mockCreateDeploymentSkillMethods = jest.fn((methods) => methods);
const mockReadWorkspaceFile = jest.fn();
const mockSearchWorkspace = jest.fn();
const mockListWorkspaceFiles = jest.fn();
const mockWriteWorkspaceFile = jest.fn();
const mockEditWorkspaceFile = jest.fn();

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
  readWorkspaceFile: (...args) => mockReadWorkspaceFile(...args),
  searchWorkspace: (...args) => mockSearchWorkspace(...args),
  listWorkspaceFiles: (...args) => mockListWorkspaceFiles(...args),
  writeWorkspaceFile: (...args) => mockWriteWorkspaceFile(...args),
  editWorkspaceFile: (...args) => mockEditWorkspaceFile(...args),
  writeSandboxFile: jest.fn(),
}));

jest.mock('@librechat/api', () => ({
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

const mockDb = {
  getSkillFileByPath: jest.fn(),
  upsertSkillFile: jest.fn(),
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
  });

  it('exposes the stable attached-workspace reader to agent handlers', () => {
    expect(getSkillToolDeps().readWorkspaceFile).toBeDefined();
    getSkillToolDeps().readWorkspaceFile({ file_path: 'src/app.ts' });
    expect(mockReadWorkspaceFile).toHaveBeenCalledWith({ file_path: 'src/app.ts' });
  });

  it('exposes the stable attached-workspace searcher to agent handlers', () => {
    expect(getSkillToolDeps().searchWorkspace).toBeDefined();
    getSkillToolDeps().searchWorkspace({ query: 'needle' });
    expect(mockSearchWorkspace).toHaveBeenCalledWith({ query: 'needle' });
  });

  it('exposes the stable attached-workspace file lister to agent handlers', () => {
    expect(getSkillToolDeps().listWorkspaceFiles).toBeDefined();
    getSkillToolDeps().listWorkspaceFiles({ path: 'src' });
    expect(mockListWorkspaceFiles).toHaveBeenCalledWith({ path: 'src' });
  });

  it('exposes attached-workspace mutations to agent handlers', () => {
    getSkillToolDeps().writeWorkspaceFile({ path: 'src/new.ts' });
    getSkillToolDeps().editWorkspaceFile({ path: 'src/app.ts' });
    expect(mockWriteWorkspaceFile).toHaveBeenCalledWith({ path: 'src/new.ts' });
    expect(mockEditWorkspaceFile).toHaveBeenCalledWith({ path: 'src/app.ts' });
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
});
