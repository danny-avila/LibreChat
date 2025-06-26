// Mock ALL dependencies BEFORE importing handleTools
jest.mock('@librechat/api', () => ({ mcpToolPattern: {} }));
jest.mock('@librechat/data-schemas', () => ({ logger: { error: jest.fn() } }));
jest.mock('@langchain/community/tools/serpapi', () => ({ SerpAPI: {} }));
jest.mock('@langchain/community/tools/calculator', () => ({ Calculator: {} }));
jest.mock('@librechat/agents', () => ({
  EnvVar: {},
  createCodeExecutionTool: jest.fn(),
  createSearchTool: jest.fn(),
}));
jest.mock('librechat-data-provider', () => ({
  Tools: {},
  EToolResources: {},
  loadWebSearchAuth: jest.fn(),
  replaceSpecialVars: jest.fn(),
}));
jest.mock('../../../../../server/services/Files/Code/process', () => ({
  primeFiles: jest.fn(),
}));
jest.mock('../../../../../server/services/PluginService', () => ({
  getUserPluginAuthValue: jest.fn(),
}));
jest.mock('../../../../../server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn(),
}));
jest.mock('../../../../../server/services/MCP', () => ({
  createMCPTool: jest.fn(),
}));
jest.mock('../../../../../app/clients/tools', () => ({
  availableTools: [
    {
      pluginKey: 'test-tool',
      authConfig: [{ authField: 'TEST_API_KEY' }],
    },
  ],
  manifestToolMap: {},
  GoogleSearchAPI: {},
  DALLE3: {},
  FluxAPI: {},
  OpenWeather: {},
  StructuredSD: {},
  StructuredACS: {},
  TraversaalSearch: {},
  StructuredWolfram: {},
  createYouTubeTools: jest.fn(),
  TavilySearchResults: {},
  createOpenAIImageTools: jest.fn(),
}));
jest.mock('../../../../../app/clients/tools/util/fileSearch', () => ({
  createFileSearchTool: jest.fn(),
  primeFiles: jest.fn(),
}));

const { validateTools } = require('../../../../../app/clients/tools/util/handleTools');

const { getUserPluginAuthValue } = require('../../../../../server/services/PluginService');

describe('handleTools.js - test only error handling change', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.TEST_API_KEY;
  });

  // Test only the specific change: throw new Error(err) instead of generic message
  it('should preserve original error details instead of generic message', async () => {
    const originalError = new Error('Specific auth error details');
    getUserPluginAuthValue.mockRejectedValue(originalError);

    await expect(validateTools({ id: 'user123' }, ['test-tool'])).rejects.toThrow(
      'Error: Specific auth error details',
    );
  });
});
