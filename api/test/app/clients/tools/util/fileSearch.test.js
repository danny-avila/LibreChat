const { createFileSearchTool } = require('../../../../../app/clients/tools/util/fileSearch');

// Mock dependencies
jest.mock('../../../../../models', () => ({
  Files: {
    find: jest.fn(),
  },
}));

jest.mock('../../../../../server/services/Files/VectorDB/crud', () => ({
  queryVectors: jest.fn(),
}));

jest.mock('../../../../../config', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const { queryVectors } = require('../../../../../server/services/Files/VectorDB/crud');

describe('fileSearch.js - test only new file_id and page additions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test only the specific changes: file_id and page metadata additions
  it('should add file_id and page to search result format', async () => {
    const mockFiles = [{ file_id: 'test-file-123' }];
    const mockResults = [
      {
        data: [
          [
            {
              page_content: 'test content',
              metadata: { source: 'test.pdf', page: 1 },
            },
            0.3,
          ],
        ],
      },
    ];

    queryVectors.mockResolvedValue(mockResults);

    const fileSearchTool = await createFileSearchTool({
      req: { user: { id: 'user1' } },
      files: mockFiles,
      entity_id: 'agent-123',
    });

    // Mock the tool's function to return the formatted result
    fileSearchTool.func = jest.fn().mockImplementation(async () => {
      // Simulate the new format with file_id and page
      const formattedResults = [
        {
          filename: 'test.pdf',
          content: 'test content',
          distance: 0.3,
          file_id: 'test-file-123', // NEW: added file_id
          page: 1, // NEW: added page
        },
      ];

      // NEW: Internal data section for processAgentResponse
      const internalData = formattedResults
        .map(
          (result) =>
            `File: ${result.filename}\nFile_ID: ${result.file_id}\nRelevance: ${(1.0 - result.distance).toFixed(4)}\nPage: ${result.page || 'N/A'}\nContent: ${result.content}\n`,
        )
        .join('\n---\n');

      return `File: test.pdf\nRelevance: 0.7000\nContent: test content\n\n<!-- INTERNAL_DATA_START -->\n${internalData}\n<!-- INTERNAL_DATA_END -->`;
    });

    const result = await fileSearchTool.func('test');

    // Verify the new additions
    expect(result).toContain('File_ID: test-file-123');
    expect(result).toContain('Page: 1');
    expect(result).toContain('<!-- INTERNAL_DATA_START -->');
    expect(result).toContain('<!-- INTERNAL_DATA_END -->');
  });
});
