// Mock the updateFileUsage function before importing the actual processFiles
jest.mock('~/models/File', () => ({
  updateFileUsage: jest.fn(),
}));

// Mock winston and logger configuration to avoid dependency issues
jest.mock('~/config', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock all other dependencies that might cause issues
jest.mock('librechat-data-provider', () => ({
  isUUID: { parse: jest.fn() },
  megabyte: 1024 * 1024,
  FileContext: { message_attachment: 'message_attachment' },
  FileSources: { local: 'local' },
  EModelEndpoint: { assistants: 'assistants' },
  EToolResources: { file_search: 'file_search' },
  mergeFileConfig: jest.fn(),
  removeNullishValues: jest.fn((obj) => obj),
  isAssistantsEndpoint: jest.fn(),
  PermissionTypes: {
    PROMPTS: 'PROMPTS',
    BOOKMARKS: 'BOOKMARKS',
    AGENTS: 'AGENTS',
    MEMORIES: 'MEMORIES',
    MULTI_CONVO: 'MULTI_CONVO',
    TEMPORARY_CHAT: 'TEMPORARY_CHAT',
    RUN_CODE: 'RUN_CODE',
    WEB_SEARCH: 'WEB_SEARCH',
  },
  Permissions: {
    SHARED_GLOBAL: 'SHARED_GLOBAL',
    USE: 'USE',
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    READ: 'READ',
    READ_AUTHOR: 'READ_AUTHOR',
    SHARE: 'SHARE',
    OPT_OUT: 'OPT_OUT',
  },
  SystemRoles: {
    ADMIN: 'ADMIN',
    USER: 'USER',
  },
  CacheKeys: {
    CONFIG_STORE: 'configStore',
    ROLES: 'roles',
    PLUGINS: 'plugins',
    GEN_TITLE: 'genTitle',
    TOOLS: 'tools',
    MODELS_CONFIG: 'modelsConfig',
    MODEL_QUERIES: 'modelQueries',
    STARTUP_CONFIG: 'startupConfig',
    ENDPOINT_CONFIG: 'endpointsConfig',
    TOKEN_CONFIG: 'tokenConfig',
    CUSTOM_CONFIG: 'customConfig',
    ABORT_KEYS: 'abortKeys',
    OVERRIDE_CONFIG: 'overrideConfig',
    BANS: 'bans',
    ENCODED_DOMAINS: 'encoded_domains',
    AUDIO_RUNS: 'audioRuns',
    MESSAGES: 'messages',
    FLOWS: 'flows',
    MCP_TOOLS: 'mcp_tools',
    PENDING_REQ: 'pending_req',
  },
  Time: {
    ONE_HOUR: 3600000,
    THIRTY_MINUTES: 1800000,
    TEN_MINUTES: 600000,
    FIVE_MINUTES: 300000,
    TWO_MINUTES: 120000,
    ONE_MINUTE: 60000,
    THIRTY_SECONDS: 30000,
  },
  ViolationTypes: {
    FILE_UPLOAD_LIMIT: 'file_upload_limit',
    ILLEGAL_MODEL_REQUEST: 'illegal_model_request',
    TOKEN_BALANCE: 'token_balance',
    BAN: 'ban',
    TTS_LIMIT: 'tts_limit',
    STT_LIMIT: 'stt_limit',
    RESET_PASSWORD_LIMIT: 'reset_password_limit',
    VERIFY_EMAIL_LIMIT: 'verify_email_limit',
    CONVO_ACCESS: 'convo_access',
    TOOL_CALL_LIMIT: 'tool_call_limit',
  },
  Constants: {
    COMMANDS_MAX_LENGTH: 56,
    VERSION: 'v0.7.9-rc1',
    CONFIG_VERSION: '1.2.8',
    NO_PARENT: '00000000-0000-0000-0000-000000000000',
    NEW_CONVO: 'new',
    PENDING_CONVO: 'PENDING',
    SEARCH: 'search',
    ENCODED_DOMAIN_LENGTH: 10,
    CURRENT_MODEL: 'current_model',
    COMMON_DIVIDER: '__',
    DEFAULT_STREAM_RATE: 1,
    SAVED_TAG: 'Saved',
    MAX_CONVO_STARTERS: 4,
    GLOBAL_PROJECT_NAME: 'instance',
    mcp_delimiter: '_mcp_',
    mcp_prefix: 'mcp_',
    EPHEMERAL_AGENT_ID: 'ephemeral',
  },
}));

jest.mock('~/server/services/Files/images', () => ({
  convertImage: jest.fn(),
  resizeAndConvert: jest.fn(),
  resizeImageBuffer: jest.fn(),
}));

jest.mock('~/server/controllers/assistants/v2', () => ({
  addResourceFileId: jest.fn(),
  deleteResourceFileId: jest.fn(),
}));

jest.mock('~/models/Agent', () => ({
  addAgentResourceFile: jest.fn(),
  removeAgentResourceFiles: jest.fn(),
}));

jest.mock('~/server/controllers/assistants/helpers', () => ({
  getOpenAIClient: jest.fn(),
}));

jest.mock('~/server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  checkCapability: jest.fn(),
}));

jest.mock('~/server/utils/queue', () => ({
  LB_QueueAsyncCall: jest.fn(),
}));

jest.mock('./strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

jest.mock('~/server/utils', () => ({
  determineFileType: jest.fn(),
}));

// Import the actual processFiles function after all mocks are set up
const { processFiles } = require('./process');
const { updateFileUsage } = require('~/models/File');

describe('processFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('null filtering functionality', () => {
    it('should filter out null results from updateFileUsage when files do not exist', async () => {
      const mockFiles = [
        { file_id: 'existing-file-1' },
        { file_id: 'non-existent-file' },
        { file_id: 'existing-file-2' },
      ];

      // Mock updateFileUsage to return null for non-existent files
      updateFileUsage.mockImplementation(({ file_id }) => {
        if (file_id === 'non-existent-file') {
          return Promise.resolve(null); // Simulate file not found in the database
        }
        return Promise.resolve({ file_id, usage: 1 });
      });

      const result = await processFiles(mockFiles);

      expect(updateFileUsage).toHaveBeenCalledTimes(3);
      expect(result).toEqual([
        { file_id: 'existing-file-1', usage: 1 },
        { file_id: 'existing-file-2', usage: 1 },
      ]);

      // Critical test - ensure no null values in result
      expect(result).not.toContain(null);
      expect(result).not.toContain(undefined);
      expect(result.length).toBe(2); // Only valid files should be returned
    });

    it('should return empty array when all updateFileUsage calls return null', async () => {
      const mockFiles = [{ file_id: 'non-existent-1' }, { file_id: 'non-existent-2' }];

      // All updateFileUsage calls return null
      updateFileUsage.mockResolvedValue(null);

      const result = await processFiles(mockFiles);

      expect(updateFileUsage).toHaveBeenCalledTimes(2);
      expect(result).toEqual([]);
      expect(result).not.toContain(null);
      expect(result.length).toBe(0);
    });

    it('should work correctly when all files exist', async () => {
      const mockFiles = [{ file_id: 'file-1' }, { file_id: 'file-2' }];

      updateFileUsage.mockImplementation(({ file_id }) => {
        return Promise.resolve({ file_id, usage: 1 });
      });

      const result = await processFiles(mockFiles);

      expect(result).toEqual([
        { file_id: 'file-1', usage: 1 },
        { file_id: 'file-2', usage: 1 },
      ]);
      expect(result).not.toContain(null);
      expect(result.length).toBe(2);
    });

    it('should handle fileIds parameter and filter nulls correctly', async () => {
      const mockFiles = [{ file_id: 'file-1' }];
      const mockFileIds = ['file-2', 'non-existent-file'];

      updateFileUsage.mockImplementation(({ file_id }) => {
        if (file_id === 'non-existent-file') {
          return Promise.resolve(null);
        }
        return Promise.resolve({ file_id, usage: 1 });
      });

      const result = await processFiles(mockFiles, mockFileIds);

      expect(result).toEqual([
        { file_id: 'file-1', usage: 1 },
        { file_id: 'file-2', usage: 1 },
      ]);
      expect(result).not.toContain(null);
      expect(result).not.toContain(undefined);
      expect(result.length).toBe(2);
    });

    it('should handle duplicate file_ids correctly', async () => {
      const mockFiles = [
        { file_id: 'duplicate-file' },
        { file_id: 'duplicate-file' }, // Duplicate should be ignored
        { file_id: 'unique-file' },
      ];

      updateFileUsage.mockImplementation(({ file_id }) => {
        return Promise.resolve({ file_id, usage: 1 });
      });

      const result = await processFiles(mockFiles);

      // Should only call updateFileUsage twice (duplicate ignored)
      expect(updateFileUsage).toHaveBeenCalledTimes(2);
      expect(result).toEqual([
        { file_id: 'duplicate-file', usage: 1 },
        { file_id: 'unique-file', usage: 1 },
      ]);
      expect(result.length).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty files array', async () => {
      const result = await processFiles([]);
      expect(result).toEqual([]);
      expect(updateFileUsage).not.toHaveBeenCalled();
    });

    it('should handle mixed null and undefined returns from updateFileUsage', async () => {
      const mockFiles = [{ file_id: 'file-1' }, { file_id: 'file-2' }, { file_id: 'file-3' }];

      updateFileUsage.mockImplementation(({ file_id }) => {
        if (file_id === 'file-1') return Promise.resolve(null);
        if (file_id === 'file-2') return Promise.resolve(undefined);
        return Promise.resolve({ file_id, usage: 1 });
      });

      const result = await processFiles(mockFiles);

      expect(result).toEqual([{ file_id: 'file-3', usage: 1 }]);
      expect(result).not.toContain(null);
      expect(result).not.toContain(undefined);
      expect(result.length).toBe(1);
    });
  });
});
