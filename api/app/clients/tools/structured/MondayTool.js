const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const fetch = require('node-fetch');
const { logger } = require('../../../../config');

class MondayTool extends Tool {
  static lc_name() {
    return 'monday-tool';
  }

  static forAgents = true;

  constructor(fields = {}) {
    super(fields);
    
    // Инициализация с API ключом из fields
    this.apiKey = fields.MONDAY_API_KEY || fields.apiKey;
    this.apiUrl = 'https://api.monday.com/v2';
    this.override = fields.override ?? false;
    
    // Определение схемы валидации
    this.schema = z.object({
      action: z.enum([
        'getBoards',
        'getBoard',
        'createBoard',
        'getItems',
        'createItem',
        'updateItem',
        'deleteItem',
        'createGroup',
        'updateColumn',
        'addComment',
        'searchItems',
        'getWorkspaces',
        'getUsers',
        'getColumnsInfo'
      ]).describe('Действие для выполнения в monday.com'),
      
      // Параметры для досок
      boardId: z.string().optional().describe('ID доски в monday.com'),
      boardName: z.string().optional().describe('Название доски'),
      boardKind: z.enum(['public', 'private', 'share']).optional().describe('Тип доски'),
      workspaceId: z.string().optional().describe('ID рабочего пространства'),
      
      // Параметры для элементов
      itemId: z.string().optional().describe('ID элемента'),
      itemName: z.string().optional().describe('Название элемента'),
      groupId: z.string().optional().describe('ID группы'),
      
      // Параметры для колонок
      columnId: z.string().optional().describe('ID колонки'),
      columnValues: z.record(z.any()).optional().describe('Значения колонок в формате JSON'),
      
      // Параметры для комментариев
      body: z.string().optional().describe('Текст комментария'),
      
      // Общие параметры
      limit: z.number().min(1).max(100).default(25).optional().describe('Количество элементов для получения'),
      page: z.number().min(1).default(1).optional().describe('Номер страницы'),
      query: z.string().optional().describe('Поисковый запрос'),
      
      // Дополнительные параметры
      includeItems: z.boolean().optional().describe('Включить элементы в ответ'),
      includeGroups: z.boolean().optional().describe('Включить группы в ответ'),
      includeColumns: z.boolean().optional().describe('Включить колонки в ответ')
    });

    this.name = 'monday-tool';
    this.description = `Полный инструмент для работы с monday.com через GraphQL API. Поддерживает:
- Управление досками (создание, получение списка, детализация)
- Работа с элементами (создание, обновление, удаление, поиск)
- Управление группами и колонками
- Добавление комментариев
- Получение информации о пользователях и рабочих пространствах
Используйте этот инструмент для автоматизации управления проектами в monday.com.`;

    if (!this.apiKey && !this.override) {
      throw new Error('Monday.com API key is required. Please provide MONDAY_API_KEY.');
    }
  }

  async _call(input) {
    try {
      const parsedInput = this.schema.parse(input);
      
      if (!this.apiKey && !this.override) {
        throw new Error('Monday.com API key not configured');
      }

      logger.debug(`[MondayTool] Executing action: ${parsedInput.action}`, { 
        action: parsedInput.action,
        params: Object.keys(parsedInput).filter(key => key !== 'action')
      });

      // Маршрутизация к соответствующему методу
      switch (parsedInput.action) {
        case 'getBoards':
          return await this.getBoards(parsedInput);
        case 'getBoard':
          return await this.getBoard(parsedInput);
        case 'createBoard':
          return await this.createBoard(parsedInput);
        case 'getItems':
          return await this.getItems(parsedInput);
        case 'createItem':
          return await this.createItem(parsedInput);
        case 'updateItem':
          return await this.updateItem(parsedInput);
        case 'deleteItem':
          return await this.deleteItem(parsedInput);
        case 'createGroup':
          return await this.createGroup(parsedInput);
        case 'updateColumn':
          return await this.updateColumn(parsedInput);
        case 'addComment':
          return await this.addComment(parsedInput);
        case 'searchItems':
          return await this.searchItems(parsedInput);
        case 'getWorkspaces':
          return await this.getWorkspaces(parsedInput);
        case 'getUsers':
          return await this.getUsers(parsedInput);
        case 'getColumnsInfo':
          return await this.getColumnsInfo(parsedInput);
        default:
          throw new Error(`Unknown action: ${parsedInput.action}`);
      }
    } catch (error) {
      logger.error('[MondayTool] Error:', { 
        message: error.message,
        stack: error.stack,
        input: input
      });
      return JSON.stringify({ 
        error: error.message,
        success: false,
        action: input?.action || 'unknown'
      });
    }
  }

  // Базовый метод для GraphQL запросов
  async makeGraphQLRequest(query, variables = {}) {
    if (!this.apiKey && !this.override) {
      throw new Error('API key is required');
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.apiKey,
        'API-Version': '2024-01'
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      logger.error('[MondayTool] GraphQL Errors:', data.errors);
      throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
    }
    
    return data.data;
  }

  // Методы для работы с досками
  async getBoards({ limit = 25, page = 1, workspaceId }) {
    const offset = (page - 1) * limit;
    const query = `
      query getBoards($limit: Int!, $page: Int!, $workspaceIds: [ID]) {
        boards(limit: $limit, page: $page, workspace_ids: $workspaceIds) {
          id
          name
          description
          state
          board_kind
          workspace {
            id
            name
          }
          groups {
            id
            title
            color
          }
          columns {
            id
            title
            type
            settings_str
          }
          items_count
        }
      }
    `;
    
    const variables = { 
      limit, 
      page,
      workspaceIds: workspaceId ? [workspaceId] : null
    };

    const data = await this.makeGraphQLRequest(query, variables);
    return JSON.stringify({
      success: true,
      action: 'getBoards',
      data: data.boards,
      total: data.boards.length
    });
  }

  async getBoard({ boardId, includeItems = false, includeGroups = true, includeColumns = true }) {
    if (!boardId) {
      throw new Error('boardId is required for getBoard action');
    }

    const query = `
      query getBoard($boardId: [ID!]!, $includeItems: Boolean!, $includeGroups: Boolean!, $includeColumns: Boolean!) {
        boards(ids: $boardId) {
          id
          name
          description
          state
          board_kind
          workspace {
            id
            name
          }
          groups @include(if: $includeGroups) {
            id
            title
            color
            position
          }
          columns @include(if: $includeColumns) {
            id
            title
            type
            settings_str
          }
          items_count
          items(limit: 10) @include(if: $includeItems) {
            id
            name
            state
            group {
              id
              title
            }
          }
        }
      }
    `;

    const data = await this.makeGraphQLRequest(query, {
      boardId: [boardId],
      includeItems,
      includeGroups,
      includeColumns
    });

    if (!data.boards || data.boards.length === 0) {
      throw new Error(`Board with ID ${boardId} not found`);
    }

    return JSON.stringify({
      success: true,
      action: 'getBoard',
      data: data.boards[0]
    });
  }

  async createBoard({ boardName, workspaceId, boardKind = 'public' }) {
    if (!boardName) {
      throw new Error('boardName is required for createBoard action');
    }

    const mutation = `
      mutation createBoard($boardName: String!, $boardKind: BoardKind!, $workspaceId: ID) {
        create_board(
          board_name: $boardName,
          board_kind: $boardKind,
          workspace_id: $workspaceId
        ) {
          id
          name
          board_kind
          workspace {
            id
            name
          }
        }
      }
    `;

    const data = await this.makeGraphQLRequest(mutation, {
      boardName,
      boardKind,
      workspaceId: workspaceId ? parseInt(workspaceId) : null
    });

    return JSON.stringify({
      success: true,
      action: 'createBoard',
      data: data.create_board
    });
  }

  // Методы для работы с элементами
  async getItems({ boardId, groupId, limit = 25, columnValues = false }) {
    if (!boardId) {
      throw new Error('boardId is required for getItems action');
    }

    const query = `
      query getItems($boardId: [ID!]!, $limit: Int!, $columnValues: Boolean!) {
        boards(ids: $boardId) {
          items(limit: $limit) {
            id
            name
            state
            created_at
            updated_at
            group {
              id
              title
            }
            column_values @include(if: $columnValues) {
              id
              title
              type
              text
              value
            }
          }
        }
      }
    `;

    const data = await this.makeGraphQLRequest(query, {
      boardId: [boardId],
      limit,
      columnValues
    });

    let items = data.boards[0]?.items || [];
    
    // Фильтрация по группе, если указана
    if (groupId) {
      items = items.filter(item => item.group?.id === groupId);
    }

    return JSON.stringify({
      success: true,
      action: 'getItems',
      data: items,
      total: items.length
    });
  }

  async createItem({ boardId, itemName, groupId, columnValues }) {
    if (!boardId || !itemName) {
      throw new Error('boardId and itemName are required for createItem action');
    }

    const mutation = `
      mutation createItem($boardId: ID!, $itemName: String!, $groupId: String, $columnValues: JSON) {
        create_item(
          board_id: $boardId,
          item_name: $itemName,
          group_id: $groupId,
          column_values: $columnValues
        ) {
          id
          name
          group {
            id
            title
          }
          column_values {
            id
            title
            text
            value
          }
        }
      }
    `;

    const data = await this.makeGraphQLRequest(mutation, {
      boardId: parseInt(boardId),
      itemName,
      groupId,
      columnValues: columnValues ? JSON.stringify(columnValues) : null
    });

    return JSON.stringify({
      success: true,
      action: 'createItem',
      data: data.create_item
    });
  }

  async updateItem({ itemId, columnValues }) {
    if (!itemId || !columnValues) {
      throw new Error('itemId and columnValues are required for updateItem action');
    }

    const mutation = `
      mutation updateItem($itemId: ID!, $columnValues: JSON!) {
        change_multiple_column_values(
          item_id: $itemId,
          board_id: 0,
          column_values: $columnValues
        ) {
          id
          name
          column_values {
            id
            title
            text
            value
          }
        }
      }
    `;

    const data = await this.makeGraphQLRequest(mutation, {
      itemId: parseInt(itemId),
      columnValues: JSON.stringify(columnValues)
    });

    return JSON.stringify({
      success: true,
      action: 'updateItem',
      data: data.change_multiple_column_values
    });
  }

  async deleteItem({ itemId }) {
    if (!itemId) {
      throw new Error('itemId is required for deleteItem action');
    }

    const mutation = `
      mutation deleteItem($itemId: ID!) {
        delete_item(item_id: $itemId) {
          id
        }
      }
    `;

    const data = await this.makeGraphQLRequest(mutation, {
      itemId: parseInt(itemId)
    });

    return JSON.stringify({
      success: true,
      action: 'deleteItem',
      data: data.delete_item
    });
  }

  // Методы для работы с группами
  async createGroup({ boardId, groupName }) {
    if (!boardId || !groupName) {
      throw new Error('boardId and groupName are required for createGroup action');
    }

    const mutation = `
      mutation createGroup($boardId: ID!, $groupName: String!) {
        create_group(board_id: $boardId, group_name: $groupName) {
          id
          title
          color
        }
      }
    `;

    const data = await this.makeGraphQLRequest(mutation, {
      boardId: parseInt(boardId),
      groupName
    });

    return JSON.stringify({
      success: true,
      action: 'createGroup',
      data: data.create_group
    });
  }

  // Методы для работы с колонками
  async updateColumn({ boardId, itemId, columnId, value }) {
    if (!boardId || !itemId || !columnId || value === undefined) {
      throw new Error('boardId, itemId, columnId and value are required for updateColumn action');
    }

    const mutation = `
      mutation updateColumn($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
        change_column_value(
          board_id: $boardId,
          item_id: $itemId,
          column_id: $columnId,
          value: $value
        ) {
          id
          name
        }
      }
    `;

    const data = await this.makeGraphQLRequest(mutation, {
      boardId: parseInt(boardId),
      itemId: parseInt(itemId),
      columnId,
      value: JSON.stringify(value)
    });

    return JSON.stringify({
      success: true,
      action: 'updateColumn',
      data: data.change_column_value
    });
  }

  // Методы для работы с комментариями
  async addComment({ itemId, body }) {
    if (!itemId || !body) {
      throw new Error('itemId and body are required for addComment action');
    }

    const mutation = `
      mutation addComment($itemId: ID!, $body: String!) {
        create_update(item_id: $itemId, body: $body) {
          id
          body
          created_at
        }
      }
    `;

    const data = await this.makeGraphQLRequest(mutation, {
      itemId: parseInt(itemId),
      body
    });

    return JSON.stringify({
      success: true,
      action: 'addComment',
      data: data.create_update
    });
  }

  // Методы поиска
  async searchItems({ query, boardIds }) {
    if (!query) {
      throw new Error('query is required for searchItems action');
    }

    const searchQuery = `
      query searchItems($query: String!, $boardIds: [ID]) {
        items_by_column_values(
          board_ids: $boardIds,
          column_id: "name",
          column_value: $query
        ) {
          id
          name
          board {
            id
            name
          }
          group {
            id
            title
          }
          column_values {
            id
            title
            text
          }
        }
      }
    `;

    const data = await this.makeGraphQLRequest(searchQuery, {
      query,
      boardIds: boardIds ? boardIds.map(id => parseInt(id)) : null
    });

    return JSON.stringify({
      success: true,
      action: 'searchItems',
      data: data.items_by_column_values,
      total: data.items_by_column_values.length
    });
  }

  // Вспомогательные методы
  async getWorkspaces({ limit = 25 }) {
    const query = `
      query getWorkspaces($limit: Int!) {
        workspaces(limit: $limit) {
          id
          name
          description
          created_at
          state
        }
      }
    `;

    const data = await this.makeGraphQLRequest(query, { limit });

    return JSON.stringify({
      success: true,
      action: 'getWorkspaces',
      data: data.workspaces
    });
  }

  async getUsers({ limit = 25 }) {
    const query = `
      query getUsers($limit: Int!) {
        users(limit: $limit) {
          id
          name
          email
          created_at
          enabled
        }
      }
    `;

    const data = await this.makeGraphQLRequest(query, { limit });

    return JSON.stringify({
      success: true,
      action: 'getUsers',
      data: data.users
    });
  }

  async getColumnsInfo({ boardId }) {
    if (!boardId) {
      throw new Error('boardId is required for getColumnsInfo action');
    }

    const query = `
      query getColumnsInfo($boardId: [ID!]!) {
        boards(ids: $boardId) {
          columns {
            id
            title
            type
            settings_str
            description
          }
        }
      }
    `;

    const data = await this.makeGraphQLRequest(query, {
      boardId: [boardId]
    });

    return JSON.stringify({
      success: true,
      action: 'getColumnsInfo',
      data: data.boards[0]?.columns || []
    });
  }
}

module.exports = MondayTool;
