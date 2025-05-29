const MondayTool = require('./MondayTool');
const { logger } = require('../../../config');

// Мокаем fetch для тестов
global.fetch = jest.fn();

describe('MondayTool v2.0 - Extended Integration Tests', () => {
  let mondayTool;
  
  beforeEach(() => {
    // Создаем инстанс с тестовым API ключом
    mondayTool = new MondayTool({ 
      MONDAY_API_KEY: 'test_api_key_123',
      override: false 
    });
    
    // Очищаем все моки
    fetch.mockClear();
  });

  describe('ФАЗА 1: Webhooks Integration', () => {
    test('should create webhook successfully', async () => {
      const mockResponse = {
        data: {
          create_webhook: {
            id: 'webhook_123',
            board_id: '123',
            url: 'https://example.com/webhook',
            event: 'create_item'
          }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await mondayTool._call({
        action: 'createWebhook',
        boardId: '123',
        url: 'https://example.com/webhook',
        event: 'create_item'
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.action).toBe('createWebhook');
      expect(parsedResult.data.id).toBe('webhook_123');
    });

    test('should get webhooks for board', async () => {
      const mockResponse = {
        data: {
          webhooks: [
            {
              id: 'webhook_123',
              board_id: '123',
              url: 'https://example.com/webhook',
              event: 'create_item'
            }
          ]
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await mondayTool._call({
        action: 'getWebhooks',
        boardId: '123'
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.data).toHaveLength(1);
    });

    test('should create update successfully', async () => {
      const mockResponse = {
        data: {
          create_update: {
            id: 'update_123',
            body: 'Test update',
            created_at: '2025-05-29T10:00:00Z'
          }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await mondayTool._call({
        action: 'createUpdate',
        itemId: '456',
        body: 'Test update'
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.data.body).toBe('Test update');
    });
  });

  describe('ФАЗА 2: Teams Management', () => {
    test('should create team successfully', async () => {
      const mockResponse = {
        data: {
          create_team: {
            id: 'team_123',
            name: 'Test Team',
            description: 'Test team description'
          }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await mondayTool._call({
        action: 'createTeam',
        name: 'Test Team',
        description: 'Test team description'
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.data.name).toBe('Test Team');
    });

    test('should add user to team', async () => {
      const mockResponse = {
        data: {
          add_users_to_team: {
            id: 'team_123',
            users: [{ id: 'user_456', name: 'Test User' }]
          }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await mondayTool._call({
        action: 'addUserToTeam',
        teamId: 'team_123',
        userId: 'user_456'
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
    });

    test('should invite new user', async () => {
      const mockResponse = {
        data: {
          add_users_to_workspace: [
            {
              id: 'user_789',
              email: 'newuser@example.com',
              enabled: true
            }
          ]
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await mondayTool._call({
        action: 'inviteUser',
        email: 'newuser@example.com',
        userKind: 'member'
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
    });
  });

  describe('ФАЗА 3: Workspaces & Structure', () => {
    test('should create workspace successfully', async () => {
      const mockResponse = {
        data: {
          create_workspace: {
            id: 'workspace_123',
            name: 'Test Workspace',
            kind: 'open'
          }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await mondayTool._call({
        action: 'createWorkspace',
        name: 'Test Workspace',
        workspaceKind: 'open'
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.data.name).toBe('Test Workspace');
    });

    test('should create folder successfully', async () => {
      const mockResponse = {
        data: {
          create_folder: {
            id: 'folder_123',
            name: 'Test Folder',
            workspace: { id: 'workspace_123' }
          }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await mondayTool._call({
        action: 'createFolder',
        name: 'Test Folder',
        workspaceId: 'workspace_123'
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.data.name).toBe('Test Folder');
    });

    test('should duplicate board successfully', async () => {
      const mockResponse = {
        data: {
          duplicate_board: {
            board: {
              id: 'board_new',
              name: 'Duplicated Board',
              state: 'active'
            }
          }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await mondayTool._call({
        action: 'duplicateBoard',
        boardId: 'board_123',
        duplicateType: 'duplicate_structure_and_items',
        boardName: 'Duplicated Board'
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
    });
  });

  describe('Assets Management', () => {
    test('should search assets successfully', async () => {
      const mockResponse = {
        data: {
          assets: [
            {
              id: 'asset_123',
              name: 'test-file.pdf',
              url: 'https://example.com/file.pdf',
              file_size: 1024
            }
          ]
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await mondayTool._call({
        action: 'searchAssets',
        query: 'test-file',
        workspaceId: 'workspace_123'
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.data).toHaveLength(1);
    });

    test('should create asset public URL', async () => {
      const mockResponse = {
        data: {
          create_asset_public_url: {
            public_url: 'https://public.example.com/file.pdf',
            expires_at: '2025-06-29T10:00:00Z'
          }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await mondayTool._call({
        action: 'createAssetPublicUrl',
        assetId: 'asset_123'
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.data.public_url).toContain('https://');
    });
  });

  describe('Advanced Columns & Groups', () => {
    test('should create column successfully', async () => {
      const mockResponse = {
        data: {
          create_column: {
            id: 'column_123',
            title: 'New Column',
            type: 'text'
          }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await mondayTool._call({
        action: 'createColumn',
        boardId: 'board_123',
        title: 'New Column',
        columnType: 'text'
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.data.title).toBe('New Column');
    });

    test('should duplicate group successfully', async () => {
      const mockResponse = {
        data: {
          duplicate_group: {
            id: 'group_new',
            title: 'Duplicated Group',
            color: 'blue'
          }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await mondayTool._call({
        action: 'duplicateGroup',
        boardId: 'board_123',
        groupId: 'group_original',
        groupName: 'Duplicated Group'
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.data.title).toBe('Duplicated Group');
    });
  });

  describe('Batch Operations', () => {
    test('should execute batch operations successfully', async () => {
      const mockResponses = [
        { data: { create_item: { id: 'item_1', name: 'Task 1' } } },
        { data: { create_item: { id: 'item_2', name: 'Task 2' } } },
        { data: { change_multiple_column_values: { id: 'item_3' } } }
      ];

      fetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockResponses[0] })
        .mockResolvedValueOnce({ ok: true, json: async () => mockResponses[1] })
        .mockResolvedValueOnce({ ok: true, json: async () => mockResponses[2] });

      const result = await mondayTool._call({
        action: 'batchOperation',
        operations: [
          { action: 'createItem', boardId: '123', itemName: 'Task 1' },
          { action: 'createItem', boardId: '123', itemName: 'Task 2' },
          { action: 'updateItem', itemId: '456', columnValues: { status: 'Done' } }
        ]
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.data).toHaveLength(3);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing required parameters', async () => {
      const result = await mondayTool._call({
        action: 'createWebhook'
        // Missing required parameters
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(false);
      expect(parsedResult.error).toContain('boardId');
    });

    test('should handle API errors', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: 'Invalid API key' }]
        })
      });

      const result = await mondayTool._call({
        action: 'getBoards'
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(false);
      expect(parsedResult.error).toContain('GraphQL Error');
    });

    test('should handle network errors', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await mondayTool._call({
        action: 'getBoards'
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(false);
      expect(parsedResult.error).toContain('Network error');
    });
  });

  describe('Utility Functions', () => {
    test('should validate webhook URL correctly', () => {
      expect(mondayTool.validateWebhookUrl('https://example.com/webhook')).toBe(true);
      expect(mondayTool.validateWebhookUrl('http://example.com/webhook')).toBe(false);
      expect(mondayTool.validateWebhookUrl('invalid-url')).toBe(false);
    });

    test('should format agent response correctly', () => {
      const response = mondayTool.formatAgentResponse({ id: '123' }, 'test');
      
      expect(response.success).toBe(true);
      expect(response.action).toBe('test');
      expect(response.data.id).toBe('123');
      expect(response.timestamp).toBeDefined();
      expect(response.apiVersion).toBe('2024-01');
    });
  });

  describe('Backwards Compatibility', () => {
    test('should maintain compatibility with v1 actions', async () => {
      const mockResponse = {
        data: {
          boards: [
            { id: '123', name: 'Test Board' }
          ]
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      // Тест старого действия getBoards
      const result = await mondayTool._call({
        action: 'getBoards',
        limit: 25
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult.success).toBe(true);
      expect(parsedResult.data).toHaveLength(1);
    });
  });
});

describe('Integration Test Scenarios', () => {
  let mondayTool;
  
  beforeEach(() => {
    mondayTool = new MondayTool({ 
      MONDAY_API_KEY: 'test_api_key_123' 
    });
    fetch.mockClear();
  });

  test('Complete project setup workflow', async () => {
    // 1. Создание workspace
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { create_workspace: { id: 'ws_123' } } })
    });

    // 2. Создание команды
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { create_team: { id: 'team_123' } } })
    });

    // 3. Создание доски
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { create_board: { id: 'board_123' } } })
    });

    // 4. Создание webhook
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { create_webhook: { id: 'webhook_123' } } })
    });

    // Выполнение workflow
    const operations = [
      { action: 'createWorkspace', name: 'Project Alpha' },
      { action: 'createTeam', name: 'Alpha Team' },
      { action: 'createBoard', boardName: 'Alpha Board', workspaceId: 'ws_123' },
      { action: 'createWebhook', boardId: 'board_123', url: 'https://example.com/webhook', event: 'create_item' }
    ];

    const results = [];
    for (const operation of operations) {
      const result = await mondayTool._call(operation);
      results.push(JSON.parse(result));
    }

    // Проверка успешности всех операций
    results.forEach(result => {
      expect(result.success).toBe(true);
    });

    expect(results).toHaveLength(4);
  });
});

// Заглушка для корректного завершения тестов
afterAll(() => {
  jest.clearAllMocks();
});
