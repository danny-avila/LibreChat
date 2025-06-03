const MondayTool = require('./MondayTool');

describe('MondayTool', () => {
  let mondayTool;

  beforeEach(() => {
    // Создаем экземпляр с override для тестирования без API ключа
    mondayTool = new MondayTool({ override: true });
  });

  describe('Constructor', () => {
    test('should create instance with override', () => {
      expect(mondayTool).toBeInstanceOf(MondayTool);
      expect(mondayTool.name).toBe('monday-tool');
      expect(mondayTool.override).toBe(true);
    });

    test('should throw error without API key and override', () => {
      expect(() => {
        new MondayTool({});
      }).toThrow('Monday.com API key is required');
    });

    test('should create instance with API key', () => {
      const tool = new MondayTool({ MONDAY_API_KEY: 'test-key' });
      expect(tool.apiKey).toBe('test-key');
    });
  });

  describe('Schema validation', () => {
    test('should validate valid input', () => {
      const validInput = {
        action: 'getBoards',
        limit: 10,
        page: 1
      };

      const result = mondayTool.schema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    test('should reject invalid action', () => {
      const invalidInput = {
        action: 'invalidAction'
      };

      const result = mondayTool.schema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    test('should validate getBoard input', () => {
      const input = {
        action: 'getBoard',
        boardId: '12345',
        includeItems: true
      };

      const result = mondayTool.schema.safeParse(input);
      expect(result.success).toBe(true);
    });

    test('should validate createItem input', () => {
      const input = {
        action: 'createItem',
        boardId: '12345',
        itemName: 'Test Item',
        columnValues: {
          status: 'In Progress'
        }
      };

      const result = mondayTool.schema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('Error handling', () => {
    test('should handle invalid input gracefully', async () => {
      const result = await mondayTool._call({ action: 'invalidAction' });
      const parsedResult = JSON.parse(result);
      
      expect(parsedResult.success).toBe(false);
      expect(parsedResult.error).toContain('Invalid enum value');
    });

    test('should handle missing required parameters', async () => {
      const result = await mondayTool._call({ 
        action: 'getBoard' 
        // Missing boardId
      });
      const parsedResult = JSON.parse(result);
      
      expect(parsedResult.success).toBe(false);
      expect(parsedResult.error).toContain('boardId is required');
    });
  });

  describe('GraphQL request method', () => {
    test('should handle API key missing error', async () => {
      const tool = new MondayTool({ override: true });
      tool.apiKey = null; // Remove the API key after construction
      tool.override = false; // Disable override to test API key validation
      
      await expect(tool.makeGraphQLRequest('query { boards { id } }')).rejects.toThrow('API key is required');
    });
  });

  describe('Action routing', () => {
    const mockMakeGraphQLRequest = jest.fn();

    beforeEach(() => {
      mondayTool.makeGraphQLRequest = mockMakeGraphQLRequest;
    });

    test('should route getBoards action correctly', async () => {
      mockMakeGraphQLRequest.mockResolvedValue({ boards: [] });

      const result = await mondayTool._call({
        action: 'getBoards',
        limit: 10
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.action).toBe('getBoards');
      expect(mockMakeGraphQLRequest).toHaveBeenCalledWith(
        expect.stringContaining('query getBoards'),
        expect.objectContaining({ limit: 10 })
      );
    });

    test('should route createItem action correctly', async () => {
      mockMakeGraphQLRequest.mockResolvedValue({ 
        create_item: { id: '123', name: 'Test Item' } 
      });

      const result = await mondayTool._call({
        action: 'createItem',
        boardId: '456',
        itemName: 'Test Item'
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.action).toBe('createItem');
      expect(mockMakeGraphQLRequest).toHaveBeenCalledWith(
        expect.stringContaining('mutation createItem'),
        expect.objectContaining({
          boardId: 456,
          itemName: 'Test Item'
        })
      );
    });
  });
});
