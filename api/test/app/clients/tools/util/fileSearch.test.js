const axios = require('axios');

jest.mock('axios');
jest.mock('@librechat/api', () => ({
  generateShortLivedToken: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('~/models', () => ({
  getFiles: jest.fn().mockResolvedValue([]),
}));

jest.mock('~/server/services/Files/permissions', () => ({
  filterFilesByAgentAccess: jest.fn((options) => Promise.resolve(options.files)),
}));

const { createFileSearchTool } = require('~/app/clients/tools/util/fileSearch');
const { generateShortLivedToken } = require('@librechat/api');

describe('fileSearch.js - tuple return validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAG_API_URL = 'http://localhost:8000';
  });

  describe('error cases should return tuple with undefined as second value', () => {
    it('should return tuple when no files provided', async () => {
      const fileSearchTool = await createFileSearchTool({
        userId: 'user1',
        files: [],
      });

      const result = await fileSearchTool.func({ query: 'test query' });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('No files to search. Instruct the user to add files for the search.');
      expect(result[1]).toBeUndefined();
    });

    it('should return tuple when JWT token generation fails', async () => {
      generateShortLivedToken.mockReturnValue(null);

      const fileSearchTool = await createFileSearchTool({
        userId: 'user1',
        files: [{ file_id: 'file-1', filename: 'test.pdf' }],
      });

      const result = await fileSearchTool.func({ query: 'test query' });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('There was an error authenticating the file search request.');
      expect(result[1]).toBeUndefined();
    });

    it('should return tuple when no valid results found', async () => {
      generateShortLivedToken.mockReturnValue('mock-jwt-token');
      axios.post.mockRejectedValue(new Error('API Error'));

      const fileSearchTool = await createFileSearchTool({
        userId: 'user1',
        files: [{ file_id: 'file-1', filename: 'test.pdf' }],
      });

      const result = await fileSearchTool.func({ query: 'test query' });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('No results found or errors occurred while searching the files.');
      expect(result[1]).toBeUndefined();
    });
  });

  describe('success cases should return tuple with artifact object', () => {
    it('should return tuple with formatted results and sources artifact', async () => {
      generateShortLivedToken.mockReturnValue('mock-jwt-token');

      const mockApiResponse = {
        data: [
          [
            {
              page_content: 'This is test content from the document',
              metadata: { source: '/path/to/test.pdf', page: 1 },
            },
            0.2,
          ],
          [
            {
              page_content: 'Additional relevant content',
              metadata: { source: '/path/to/test.pdf', page: 2 },
            },
            0.35,
          ],
        ],
      };

      axios.post.mockResolvedValue(mockApiResponse);

      const fileSearchTool = await createFileSearchTool({
        userId: 'user1',
        files: [{ file_id: 'file-123', filename: 'test.pdf' }],
        entity_id: 'agent-456',
      });

      const result = await fileSearchTool.func({ query: 'test query' });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);

      const [formattedString, artifact] = result;

      expect(typeof formattedString).toBe('string');
      expect(formattedString).toContain('File: test.pdf');
      expect(formattedString).toContain('Relevance:');
      expect(formattedString).toContain('This is test content from the document');
      expect(formattedString).toContain('Additional relevant content');

      expect(artifact).toBeDefined();
      expect(artifact).toHaveProperty('file_search');
      expect(artifact.file_search).toHaveProperty('sources');
      expect(artifact.file_search).toHaveProperty('fileCitations', false);
      expect(Array.isArray(artifact.file_search.sources)).toBe(true);
      expect(artifact.file_search.sources.length).toBe(2);

      const source = artifact.file_search.sources[0];
      expect(source).toMatchObject({
        type: 'file',
        fileId: 'file-123',
        fileName: 'test.pdf',
        content: expect.any(String),
        relevance: expect.any(Number),
        pages: [1],
        pageRelevance: { 1: expect.any(Number) },
      });
    });

    it('should include file citations in description when enabled', async () => {
      generateShortLivedToken.mockReturnValue('mock-jwt-token');

      const mockApiResponse = {
        data: [
          [
            {
              page_content: 'Content with citations',
              metadata: { source: '/path/to/doc.pdf', page: 3 },
            },
            0.15,
          ],
        ],
      };

      axios.post.mockResolvedValue(mockApiResponse);

      const fileSearchTool = await createFileSearchTool({
        userId: 'user1',
        files: [{ file_id: 'file-789', filename: 'doc.pdf' }],
        fileCitations: true,
      });

      const result = await fileSearchTool.func({ query: 'test query' });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);

      const [formattedString, artifact] = result;

      expect(formattedString).toContain('Anchor:');
      expect(formattedString).toContain('\\ue202turn0file0');
      expect(artifact.file_search.fileCitations).toBe(true);
    });

    it('should handle multiple files correctly', async () => {
      generateShortLivedToken.mockReturnValue('mock-jwt-token');

      const mockResponse1 = {
        data: [
          [
            {
              page_content: 'Content from file 1',
              metadata: { source: '/path/to/file1.pdf', page: 1 },
            },
            0.25,
          ],
        ],
      };

      const mockResponse2 = {
        data: [
          [
            {
              page_content: 'Content from file 2',
              metadata: { source: '/path/to/file2.pdf', page: 1 },
            },
            0.15,
          ],
        ],
      };

      axios.post.mockResolvedValueOnce(mockResponse1).mockResolvedValueOnce(mockResponse2);

      const fileSearchTool = await createFileSearchTool({
        userId: 'user1',
        files: [
          { file_id: 'file-1', filename: 'file1.pdf' },
          { file_id: 'file-2', filename: 'file2.pdf' },
        ],
      });

      const result = await fileSearchTool.func({ query: 'test query' });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);

      const [formattedString, artifact] = result;

      expect(formattedString).toContain('file1.pdf');
      expect(formattedString).toContain('file2.pdf');
      expect(artifact.file_search.sources).toHaveLength(2);
      // Results are sorted by distance (ascending), so file-2 (0.15) comes before file-1 (0.25)
      expect(artifact.file_search.sources[0].fileId).toBe('file-2');
      expect(artifact.file_search.sources[1].fileId).toBe('file-1');
    });
  });
});
