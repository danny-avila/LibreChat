const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const fetch = require('node-fetch');
const { logger } = require('../../../../config');

// Импорт всех модулей для расширенных возможностей
const mondayQueries = require('./utils/mondayQueries');
const webhookQueries = require('./utils/mondayWebhooks');
const updateQueries = require('./utils/mondayUpdates');
const teamQueries = require('./utils/mondayTeams');
const userQueries = require('./utils/mondayUsers');
const workspaceQueries = require('./utils/mondayWorkspaces');
const assetQueries = require('./utils/mondayAssets');
const advancedQueries = require('./utils/mondayAdvanced');
const mondayMutations = require('./utils/mondayMutations');

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
    
    // Определение схемы валидации с расширенными действиями
    this.schema = z.object({
      action: z.enum([
        // Базовые операции
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
        'getColumnsInfo',
        
        // ФАЗА 1: Webhooks и Updates
        'createWebhook',
        'getWebhooks',
        'deleteWebhook',
        'createUpdate',
        'getUpdates',
        'getBoardUpdates',
        'createUpdateReply',
        'deleteUpdate',
        'likeUpdate',
        'unlikeUpdate',
        'getUserNotifications',
        'createNotification',
        
        // ФАЗА 2: Teams и Users Management
        'createTeam',
        'getTeams',
        'getTeam',
        'addUserToTeam',
        'removeUserFromTeam',
        'deleteTeam',
        'getUsersExtended',
        'inviteUser',
        'updateUser',
        'deactivateUser',
        'getAccount',
        
        // ФАЗА 3: Workspaces и структура
        'createWorkspace',
        'getWorkspacesExtended',
        'updateWorkspace',
        'deleteWorkspace',
        'addUsersToWorkspace',
        'removeUsersFromWorkspace',
        'getFolders',
        'createFolder',
        'updateFolder',
        'deleteFolder',
        'archiveBoard',
        'duplicateBoard',
        
        // Assets и файлы
        'addFileToUpdate',
        'addFileToColumn',
        'getAssets',
        'getBoardAssets',
        'getAssetPublicUrl',
        'searchBoardAssets',
        'getAssetThumbnail',
        
        // Расширенные операции с колонками и группами
        'createColumn',
        'updateColumnTitle',
        'deleteColumn',
        'changeColumnValue',
        'changeSimpleColumnValue',
        'changeMultipleColumnValues',
        'createGroupAdvanced',
        'updateGroup',
        'deleteGroup',
        'duplicateGroup',
        'archiveGroup',
        'moveItemToGroup',
        'getGroupsExtended',
        'getColumnSettings',
        'changeColumnMetadata'
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
      columnType: z.string().optional().describe('Тип колонки для создания'),
      columnProperty: z.string().optional().describe('Свойство колонки для изменения'),
      
      // Параметры для комментариев и обновлений
      body: z.string().optional().describe('Текст комментария или обновления'),
      updateId: z.string().optional().describe('ID обновления'),
      parentId: z.string().optional().describe('ID родительского обновления для ответа'),
      
      // Параметры для webhooks
      url: z.string().optional().describe('URL для webhook'),
      event: z.string().optional().describe('Тип события для webhook'),
      webhookId: z.string().optional().describe('ID webhook'),
      config: z.record(z.any()).optional().describe('Конфигурация webhook'),
      
      // Параметры для команд и пользователей
      teamId: z.string().optional().describe('ID команды'),
      teamName: z.string().optional().describe('Название команды'),
      userId: z.string().optional().describe('ID пользователя'),
      email: z.string().optional().describe('Email пользователя'),
      userIds: z.array(z.string()).optional().describe('Массив ID пользователей'),
      emails: z.array(z.string()).optional().describe('Массив email адресов'),
      userKind: z.enum(['member', 'viewer', 'admin']).optional().describe('Роль пользователя'),
      name: z.string().optional().describe('Имя пользователя, команды или объекта'),
      description: z.string().optional().describe('Описание объекта'),
      title: z.string().optional().describe('Должность пользователя или заголовок'),
      phone: z.string().optional().describe('Телефон пользователя'),
      location: z.string().optional().describe('Местоположение пользователя'),
      pictureUrl: z.string().optional().describe('URL изображения'),
      
      // Параметры для workspace и папок
      workspaceName: z.string().optional().describe('Название workspace'),
      workspaceKind: z.enum(['open', 'closed']).optional().describe('Тип workspace'),
      folderId: z.string().optional().describe('ID папки'),
      folderName: z.string().optional().describe('Название папки'),
      color: z.string().optional().describe('Цвет группы или папки'),
      parentFolderId: z.string().optional().describe('ID родительской папки'),
      
      // Параметры для групп
      groupName: z.string().optional().describe('Название группы'),
      
      // Параметры для assets и файлов
      assetId: z.string().optional().describe('ID asset'),
      file: z.any().optional().describe('Файл для загрузки'),
      width: z.number().optional().describe('Ширина для превью'),
      height: z.number().optional().describe('Высота для превью'),
      
      // Параметры для дублирования и перемещения
      duplicateType: z.enum(['duplicate_structure', 'duplicate_structure_and_items']).optional().describe('Тип дублирования доски'),
      keepSubscribers: z.boolean().optional().describe('Сохранить подписчиков при дублировании'),
      afterColumnId: z.string().optional().describe('ID колонки, после которой разместить'),
      afterGroupId: z.string().optional().describe('ID группы, после которой разместить'),
      position: z.string().optional().describe('Позиция для размещения'),
      addToTop: z.boolean().optional().describe('Добавить в начало'),
      
      // Параметры для шаблонов
      templateId: z.string().optional().describe('ID шаблона доски'),
      
      // Общие параметры
      limit: z.number().min(1).max(100).default(25).optional().describe('Количество элементов для получения'),
      page: z.number().min(1).default(1).optional().describe('Номер страницы'),
      query: z.string().optional().describe('Поисковый запрос'),
      ids: z.array(z.string()).optional().describe('Массив ID для запроса'),
      value: z.string().optional().describe('Значение для обновления'),
      defaults: z.record(z.any()).optional().describe('Значения по умолчанию'),
      
      // Дополнительные параметры
      includeItems: z.boolean().optional().describe('Включить элементы в ответ'),
      includeGroups: z.boolean().optional().describe('Включить группы в ответ'),
      includeColumns: z.boolean().optional().describe('Включить колонки в ответ'),
      columnValues: z.boolean().optional().describe('Включить значения колонок')
    });

    this.name = 'monday-tool';
    this.description = `Полный инструмент для работы с monday.com через GraphQL API v2. Поддерживает:

БАЗОВЫЕ ОПЕРАЦИИ:
- Управление досками (создание, получение списка, детализация, архивирование, дублирование)
- Работа с элементами (создание, обновление, удаление, поиск, перемещение)
- Управление группами и колонками (создание, обновление, удаление, перемещение)
- Добавление комментариев и обновлений

WEBHOOKS И РЕАКТИВНОСТЬ (ФАЗА 1):
- Создание и управление webhook'ами для реактивной обработки событий
- Получение логов webhook'ов и тестирование
- Создание обновлений и ответов на них
- Управление уведомлениями пользователей

УПРАВЛЕНИЕ КОМАНДАМИ (ФАЗА 2):
- Создание и управление командами проектов
- Добавление/удаление пользователей в команды
- Приглашение новых пользователей в workspace
- Расширенное управление пользователями и их ролями

СТРУКТУРА ОРГАНИЗАЦИИ (ФАЗА 3):
- Управление workspace'ами и их настройками
- Создание и организация папок проектов
- Работа с шаблонами досок
- Управление файлами и ресурсами (assets)

РАСШИРЕННЫЕ ВОЗМОЖНОСТИ:
- Продвинутые операции с колонками (дублирование, перемещение, настройки)
- Архивирование и восстановление объектов
- Поиск по файлам и создание публичных ссылок
- Получение превью изображений и управление метаданными

Используйте этот инструмент для полной автоматизации управления проектами в monday.com.`;

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
        // Базовые операции
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

        // ФАЗА 1: Webhooks
        case 'createWebhook':
          return await this.createWebhook(parsedInput);
        case 'getWebhooks':
          return await this.getWebhooks(parsedInput);
        case 'deleteWebhook':
          return await this.deleteWebhook(parsedInput);

        // ФАЗА 1: Updates и уведомления
        case 'createUpdate':
          return await this.createUpdate(parsedInput);
        case 'getUpdates':
          return await this.getUpdates(parsedInput);
        case 'getBoardUpdates':
          return await this.getBoardUpdates(parsedInput);
        case 'createUpdateReply':
          return await this.createUpdateReply(parsedInput);
        case 'deleteUpdate':
          return await this.deleteUpdate(parsedInput);
        case 'likeUpdate':
          return await this.likeUpdate(parsedInput);
        case 'unlikeUpdate':
          return await this.unlikeUpdate(parsedInput);
        case 'getUserNotifications':
          return await this.getUserNotifications(parsedInput);
        case 'createNotification':
          return await this.createNotification(parsedInput);

        // ФАЗА 2: Teams и Users
        case 'createTeam':
          return await this.createTeam(parsedInput);
        case 'getTeams':
          return await this.getTeams(parsedInput);
        case 'getTeam':
          return await this.getTeam(parsedInput);
        case 'addUserToTeam':
          return await this.addUserToTeam(parsedInput);
        case 'removeUserFromTeam':
          return await this.removeUserFromTeam(parsedInput);
        case 'deleteTeam':
          return await this.deleteTeam(parsedInput);
        case 'getUsersExtended':
          return await this.getUsersExtended(parsedInput);
        case 'inviteUser':
          return await this.inviteUser(parsedInput);
        case 'updateUser':
          return await this.updateUser(parsedInput);
        case 'deactivateUser':
          return await this.deactivateUser(parsedInput);
        case 'getAccount':
          return await this.getAccount(parsedInput);

        // ФАЗА 3: Workspaces и структура
        case 'createWorkspace':
          return await this.createWorkspace(parsedInput);
        case 'getWorkspacesExtended':
          return await this.getWorkspacesExtended(parsedInput);
        case 'updateWorkspace':
          return await this.updateWorkspace(parsedInput);
        case 'deleteWorkspace':
          return await this.deleteWorkspace(parsedInput);
        case 'addUsersToWorkspace':
          return await this.addUsersToWorkspace(parsedInput);
        case 'removeUsersFromWorkspace':
          return await this.removeUsersFromWorkspace(parsedInput);
        case 'getFolders':
          return await this.getFolders(parsedInput);
        case 'createFolder':
          return await this.createFolder(parsedInput);
        case 'updateFolder':
          return await this.updateFolder(parsedInput);
        case 'deleteFolder':
          return await this.deleteFolder(parsedInput);
        case 'archiveBoard':
          return await this.archiveBoard(parsedInput);
        case 'duplicateBoard':
          return await this.duplicateBoard(parsedInput);

        // Assets и файлы
        case 'addFileToUpdate':
          return await this.addFileToUpdate(parsedInput);
        case 'addFileToColumn':
          return await this.addFileToColumn(parsedInput);
        case 'getAssets':
          return await this.getAssets(parsedInput);
        case 'getBoardAssets':
          return await this.getBoardAssets(parsedInput);
        case 'getAssetPublicUrl':
          return await this.getAssetPublicUrl(parsedInput);
        case 'searchBoardAssets':
          return await this.searchBoardAssets(parsedInput);
        case 'getAssetThumbnail':
          return await this.getAssetThumbnail(parsedInput);

        // Расширенные операции с колонками и группами
        case 'createColumn':
          return await this.createColumn(parsedInput);
        case 'updateColumnTitle':
          return await this.updateColumnTitle(parsedInput);
        case 'deleteColumn':
          return await this.deleteColumn(parsedInput);
        case 'changeColumnValue':
          return await this.changeColumnValue(parsedInput);
        case 'changeSimpleColumnValue':
          return await this.changeSimpleColumnValue(parsedInput);
        case 'changeMultipleColumnValues':
          return await this.changeMultipleColumnValues(parsedInput);
        case 'createGroupAdvanced':
          return await this.createGroupAdvanced(parsedInput);
        case 'updateGroup':
          return await this.updateGroup(parsedInput);
        case 'deleteGroup':
          return await this.deleteGroup(parsedInput);
        case 'duplicateGroup':
          return await this.duplicateGroup(parsedInput);
        case 'archiveGroup':
          return await this.archiveGroup(parsedInput);
        case 'moveItemToGroup':
          return await this.moveItemToGroup(parsedInput);
        case 'getGroupsExtended':
          return await this.getGroupsExtended(parsedInput);
        case 'getColumnSettings':
          return await this.getColumnSettings(parsedInput);
        case 'changeColumnMetadata':
          return await this.changeColumnMetadata(parsedInput);

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
        'Authorization': `Bearer ${this.apiKey}`,
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
  async getBoards({ limit = 25, page = 1, workspaceId, boardKind, state = 'active' }) {
    const data = await this.makeGraphQLRequest(mondayQueries.GET_BOARDS, {
      limit,
      page,
      workspaceIds: workspaceId ? [workspaceId] : null,
      boardKind: boardKind || null
    });

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

    const data = await this.makeGraphQLRequest(mondayQueries.GET_BOARD_DETAILS, {
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

  async createBoard({ boardName, workspaceId, boardKind = 'public', templateId }) {
    if (!boardName) {
      throw new Error('boardName is required for createBoard action');
    }

    const data = await this.makeGraphQLRequest(mondayMutations.CREATE_BOARD, {
      boardName,
      boardKind,
      workspaceId: workspaceId || null,
      templateId: templateId || null
    });

    return JSON.stringify({
      success: true,
      action: 'createBoard',
      data: data.create_board
    });
  }

  // Методы для работы с элементами
  async getItems({ boardId, groupId, limit = 25, columnValues = false, page = 1 }) {
    if (!boardId) {
      throw new Error('boardId is required for getItems action');
    }

    const query = `
      query getItems($boardId: [ID!]!, $limit: Int!, $columnValues: Boolean!, $groupId: String, $page: Int) {
        boards(ids: $boardId) {
          items_page(limit: $limit, page: $page, group_id: $groupId) {
            cursor
            items {
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
              board {
                id
                name
              }
            }
          }
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(query, {
        boardId: [boardId],
        limit,
        columnValues,
        groupId: groupId || null,
        page
      });

      const board = data.boards?.[0];
      if (!board) {
        throw new Error(`Board ${boardId} not found`);
      }

      const items = board.items_page?.items || [];
      const cursor = board.items_page?.cursor || null;

      return JSON.stringify({
        success: true,
        action: 'getItems',
        data: items,
        total: items.length,
        cursor: cursor,
        page: page
      });
    } catch (error) {
      logger.error('[MondayTool] Error getting items:', error);
      throw new Error(`Failed to get items: ${error.message}`);
    }
  }

  async createItem({ boardId, itemName, groupId, columnValues, createLabelsIfMissing = false }) {
    if (!boardId || !itemName) {
      throw new Error('boardId and itemName are required for createItem action');
    }

    // Преобразуем columnValues в правильный формат
    const formattedColumnValues = columnValues ? JSON.stringify(columnValues) : null;

    const mutation = `
      mutation createItem($boardId: ID!, $itemName: String!, $groupId: String, $columnValues: JSON, $createLabelsIfMissing: Boolean) {
        create_item(
          board_id: $boardId,
          item_name: $itemName,
          group_id: $groupId,
          column_values: $columnValues,
          create_labels_if_missing: $createLabelsIfMissing
        ) {
          id
          name
          state
          created_at
          updated_at
          group {
            id
            title
          }
          column_values {
            id
            title
            type
            text
            value
          }
          board {
            id
            name
          }
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        boardId,
        itemName,
        groupId: groupId || null,
        columnValues: formattedColumnValues,
        createLabelsIfMissing
      });

      return JSON.stringify({
        success: true,
        action: 'createItem',
        data: data.create_item
      });
    } catch (error) {
      logger.error('[MondayTool] Error creating item:', error);
      throw new Error(`Failed to create item: ${error.message}`);
    }
  }

  async updateItem({ boardId, itemId, columnValues, createLabelsIfMissing = false }) {
    if (!boardId || !itemId || !columnValues) {
      throw new Error('boardId, itemId and columnValues are required for updateItem action');
    }

    // Преобразуем columnValues в правильный формат
    const formattedColumnValues = JSON.stringify(columnValues);

    const mutation = `
      mutation updateItem($boardId: ID!, $itemId: ID!, $columnValues: JSON!, $createLabelsIfMissing: Boolean) {
        change_multiple_column_values(
          board_id: $boardId,
          item_id: $itemId,
          column_values: $columnValues,
          create_labels_if_missing: $createLabelsIfMissing
        ) {
          id
          name
          state
          created_at
          updated_at
          column_values {
            id
            title
            type
            text
            value
          }
          board {
            id
            name
          }
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        boardId,
        itemId,
        columnValues: formattedColumnValues,
        createLabelsIfMissing
      });

      return JSON.stringify({
        success: true,
        action: 'updateItem',
        data: data.change_multiple_column_values
      });
    } catch (error) {
      logger.error('[MondayTool] Error updating item:', error);
      throw new Error(`Failed to update item: ${error.message}`);
    }
  }

  async deleteItem({ itemId }) {
    if (!itemId) {
      throw new Error('itemId is required for deleteItem action');
    }

    const data = await this.makeGraphQLRequest(mondayMutations.DELETE_ITEM, {
      itemId
    });

    return JSON.stringify({
      success: true,
      action: 'deleteItem',
      data: data.delete_item
    });
  }

  // Методы для работы с группами
  async createGroup({ boardId, groupName, color, position }) {
    if (!boardId || !groupName) {
      throw new Error('boardId and groupName are required for createGroup action');
    }

    const data = await this.makeGraphQLRequest(mondayMutations.CREATE_GROUP, {
      boardId,
      groupName,
      color: color || null,
      position: position || null
    });

    return JSON.stringify({
      success: true,
      action: 'createGroup',
      data: data.create_group
    });
  }

  // Методы для работы с колонками
  async updateColumn({ boardId, itemId, columnId, value, createLabelsIfMissing = false }) {
    if (!boardId || !itemId || !columnId || value === undefined) {
      throw new Error('boardId, itemId, columnId and value are required for updateColumn action');
    }

    // Преобразуем value в правильный формат
    const formattedValue = JSON.stringify(value);

    const mutation = `
      mutation updateColumn($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!, $createLabelsIfMissing: Boolean) {
        change_column_value(
          board_id: $boardId,
          item_id: $itemId,
          column_id: $columnId,
          value: $value,
          create_labels_if_missing: $createLabelsIfMissing
        ) {
          id
          name
          state
          created_at
          updated_at
          column_values {
            id
            title
            type
            text
            value
          }
          board {
            id
            name
          }
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        boardId,
        itemId,
        columnId,
        value: formattedValue,
        createLabelsIfMissing
      });

      return JSON.stringify({
        success: true,
        action: 'updateColumn',
        data: data.change_column_value
      });
    } catch (error) {
      logger.error('[MondayTool] Error updating column:', error);
      throw new Error(`Failed to update column: ${error.message}`);
    }
  }

  // Методы для работы с комментариями
  async addComment({ itemId, body, parentId }) {
    if (!itemId || !body) {
      throw new Error('itemId and body are required for addComment action');
    }

    const data = await this.makeGraphQLRequest(mondayMutations.ADD_COMMENT, {
      itemId,
      body,
      parentId: parentId || null
    });

    return JSON.stringify({
      success: true,
      action: 'addComment',
      data: data.create_update
    });
  }

  // Методы поиска
  async searchItems({ boardId, query, limit = 25 }) {
    if (!boardId || !query) {
      throw new Error('boardId and query are required for searchItems action');
    }

    const searchQuery = `
      query searchItems($boardId: [ID!]!, $query: String!, $limit: Int!) {
        items_page_by_column_values(
          board_id: $boardId,
          query: $query,
          limit: $limit
        ) {
          cursor
          items {
            id
            name
            state
            created_at
            updated_at
            group {
              id
              title
            }
            column_values {
              id
              title
              type
              text
              value
            }
            board {
              id
              name
            }
          }
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(searchQuery, {
        boardId: [boardId],
        query,
        limit
      });

      const items = data.items_page_by_column_values?.items || [];
      const cursor = data.items_page_by_column_values?.cursor || null;

      return JSON.stringify({
        success: true,
        action: 'searchItems',
        data: items,
        total: items.length,
        cursor: cursor
      });
    } catch (error) {
      logger.error('[MondayTool] Error searching items:', error);
      throw new Error(`Failed to search items: ${error.message}`);
    }
  }

  async getWorkspaces({ limit = 25 }) {
    const data = await this.makeGraphQLRequest(mondayQueries.GET_WORKSPACES, {
      limit
    });

    return JSON.stringify({
      success: true,
      action: 'getWorkspaces',
      data: data.workspaces || []
    });
  }

  async getColumnsInfo({ boardId }) {
    if (!boardId) {
      throw new Error('boardId is required for getColumnsInfo action');
    }

    const data = await this.makeGraphQLRequest(mondayQueries.GET_COLUMNS_INFO, {
      boardId: [boardId]
    });

    return JSON.stringify({
      success: true,
      action: 'getColumnsInfo',
      data: data.boards[0]?.columns || []
    });
  }

  // ============ ФАЗА 1: WEBHOOKS МЕТОДЫ ============

  async createWebhook({ boardId, url, event, config }) {
    if (!boardId || !url || !event) {
      throw new Error('boardId, url, and event are required for createWebhook action');
    }

    const data = await this.makeGraphQLRequest(webhookQueries.CREATE_WEBHOOK, {
      boardId,
      url,
      event,
      config
    });

    return JSON.stringify({
      success: true,
      action: 'createWebhook',
      data: data.create_webhook
    });
  }

  async getWebhooks({ boardId }) {
    if (!boardId) {
      throw new Error('boardId is required for getWebhooks action');
    }

    const data = await this.makeGraphQLRequest(webhookQueries.GET_WEBHOOKS, {
      boardId
    });

    return JSON.stringify({
      success: true,
      action: 'getWebhooks',
      data: data.webhooks
    });
  }

  async deleteWebhook({ webhookId }) {
    if (!webhookId) {
      throw new Error('webhookId is required for deleteWebhook action');
    }

    const mutation = `
      mutation deleteWebhook($webhookId: ID!) {
        delete_webhook(id: $webhookId) {
          id
          board_id
          event
          config
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        webhookId
      });

      if (!data.delete_webhook) {
        throw new Error(`Webhook ${webhookId} not found or could not be deleted`);
      }

      return JSON.stringify({
        success: true,
        action: 'deleteWebhook',
        data: data.delete_webhook
      });
    } catch (error) {
      logger.error('[MondayTool] Error deleting webhook:', error);
      throw new Error(`Failed to delete webhook: ${error.message}`);
    }
  }



  // ============ ФАЗА 1: UPDATES И УВЕДОМЛЕНИЯ МЕТОДЫ ============

  async createUpdate({ itemId, body }) {
    if (!itemId || !body) {
      throw new Error('itemId and body are required for createUpdate action');
    }

    const data = await this.makeGraphQLRequest(updateQueries.CREATE_UPDATE, {
      itemId: itemId,
      body
    });

    return JSON.stringify({
      success: true,
      action: 'createUpdate',
      data: data.create_update
    });
  }

  async getUpdates({ itemId, limit = 25, page = 1 }) {
    if (!itemId) {
      throw new Error('itemId is required for getUpdates action');
    }

    const data = await this.makeGraphQLRequest(updateQueries.GET_UPDATES, {
      itemId,
      limit,
      page
    });

    return JSON.stringify({
      success: true,
      action: 'getUpdates',
      data: data.items[0]?.updates || []
    });
  }

  async getBoardUpdates({ boardId, limit = 25, page = 1 }) {
    if (!boardId) {
      throw new Error('boardId is required for getBoardUpdates action');
    }

    const data = await this.makeGraphQLRequest(updateQueries.GET_BOARD_UPDATES, {
      boardId,
      limit,
      page
    });

    return JSON.stringify({
      success: true,
      action: 'getBoardUpdates',
      data: data.boards[0]?.updates || []
    });
  }

  async createUpdateReply({ updateId, body }) {
    if (!updateId || !body) {
      throw new Error('updateId and body are required for createUpdateReply action');
    }

    const mutation = `
      mutation createUpdateReply($parentId: ID!, $body: String!) {
        create_update(parent_id: $parentId, body: $body) {
          id
          body
          text_body
          created_at
          creator {
            id
            name
            email
          }
        }
      }
    `;

    const data = await this.makeGraphQLRequest(mutation, {
      parentId: updateId,
      body
    });

    return JSON.stringify({
      success: true,
      action: 'createUpdateReply',
      data: data.create_update
    });
  }

  async deleteUpdate({ updateId }) {
    if (!updateId) {
      throw new Error('updateId is required for deleteUpdate action');
    }

    const data = await this.makeGraphQLRequest(updateQueries.DELETE_UPDATE, {
      id: updateId
    });

    return JSON.stringify({
      success: true,
      action: 'deleteUpdate',
      data: data.delete_update
    });
  }

  async likeUpdate({ updateId }) {
    if (!updateId) {
      throw new Error('updateId is required for likeUpdate action');
    }

    const data = await this.makeGraphQLRequest(updateQueries.LIKE_UPDATE, {
      updateId
    });

    return JSON.stringify({
      success: true,
      action: 'likeUpdate',
      data: data.like_update
    });
  }

  async unlikeUpdate({ updateId }) {
    if (!updateId) {
      throw new Error('updateId is required for unlikeUpdate action');
    }

    const data = await this.makeGraphQLRequest(updateQueries.UNLIKE_UPDATE, {
      updateId
    });

    return JSON.stringify({
      success: true,
      action: 'unlikeUpdate',
      data: data.unlike_update
    });
  }

  async getUserNotifications({ limit = 25, page = 1 }) {
    const data = await this.makeGraphQLRequest(updateQueries.GET_USER_NOTIFICATIONS, {
      limit,
      page
    });

    return JSON.stringify({
      success: true,
      action: 'getUserNotifications',
      data: data.notifications
    });
  }

  // Создание уведомления (единственная доступная функция notifications API)
  async createNotification({ userId, targetId, text, targetType }) {
    if (!userId || !targetId || !text || !targetType) {
      throw new Error('userId, targetId, text, and targetType are required for createNotification action');
    }

    const data = await this.makeGraphQLRequest(updateQueries.CREATE_NOTIFICATION, {
      userId,
      targetId,
      text,
      targetType
    });

    return JSON.stringify({
      success: true,
      action: 'createNotification',
      data: data.create_notification
    });
  }

  // ============ ФАЗА 2: TEAMS И USERS МЕТОДЫ ============

  async createTeam({ teamName, name, description, pictureUrl }) {
    const teamNameToUse = teamName || name;
    if (!teamNameToUse) {
      throw new Error('teamName or name is required for createTeam action');
    }

    const input = {
      name: teamNameToUse,
      ...(description && { description }),
      ...(pictureUrl && { picture_url: pictureUrl })
    };

    const options = {
      allow_empty_team: true
    };

    const data = await this.makeGraphQLRequest(teamQueries.CREATE_TEAM, {
      input,
      options
    });

    return JSON.stringify({
      success: true,
      action: 'createTeam',
      data: data.create_team
    });
  }

  async getTeams({ ids }) {
    const data = await this.makeGraphQLRequest(teamQueries.GET_TEAMS, {
      ids
    });

    return JSON.stringify({
      success: true,
      action: 'getTeams',
      data: data.teams
    });
  }

  async getTeam({ teamId }) {
    if (!teamId) {
      throw new Error('teamId is required for getTeam action');
    }

    const data = await this.makeGraphQLRequest(teamQueries.GET_TEAM, {
      ids: [teamId]
    });

    return JSON.stringify({
      success: true,
      action: 'getTeam',
      data: data.teams[0] || null
    });
  }

  async addUserToTeam({ teamId, userId, userIds }) {
    if (!teamId || (!userId && !userIds)) {
      throw new Error('teamId and userId (or userIds) are required for addUserToTeam action');
    }

    const userIdsToAdd = userIds || [userId];

    const data = await this.makeGraphQLRequest(teamQueries.ADD_USER_TO_TEAM, {
      teamId,
      userIds: userIdsToAdd
    });

    return JSON.stringify({
      success: true,
      action: 'addUserToTeam',
      data: data.add_users_to_team
    });
  }

  async removeUserFromTeam({ teamId, userId, userIds }) {
    if (!teamId || (!userId && !userIds)) {
            throw new Error('teamId and userId (or userIds) are required for removeUserFromTeam action');
    }

    const userIdsToRemove = userIds || [userId];

    const data = await this.makeGraphQLRequest(teamQueries.REMOVE_USER_FROM_TEAM, {
      teamId,
      userIds: userIdsToRemove
    });

    return JSON.stringify({
      success: true,
      action: 'removeUserFromTeam',
      data: data.remove_users_from_team
    });
  }

  async deleteTeam({ teamId }) {
    if (!teamId) {
      throw new Error('teamId is required for deleteTeam action');
    }

    const data = await this.makeGraphQLRequest(teamQueries.DELETE_TEAM, {
      teamId
    });

    return JSON.stringify({
      success: true,
      action: 'deleteTeam',
      data: data.delete_team
    });
  }

  async getUsers({ limit = 25 }) {
    const data = await this.makeGraphQLRequest(teamQueries.GET_USERS, {
      limit
    });

    return JSON.stringify({
      success: true,
      action: 'getUsers',
      data: data.users
    });
  }

  async getUsersExtended({ limit = 25, page = 1, emails, ids }) {
    const data = await this.makeGraphQLRequest(userQueries.GET_USERS_EXTENDED, {
      limit,
      page,
      emails,
      ids
    });

    return JSON.stringify({
      success: true,
      action: 'getUsersExtended',
      data: data.users
    });
  }

  async updateUser({ userId, name, title, phone, location }) {
    if (!userId) {
      throw new Error('userId is required for updateUser action');
    }

    const mutation = `
      mutation updateUser($userId: ID!, $name: String, $title: String, $phone: String, $location: String) {
        update_user(
          user_id: $userId,
          name: $name,
          title: $title,
          phone: $phone,
          location: $location
        ) {
          id
          name
          email
          title
          phone
          location
          enabled
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        userId,
        name: name || null,
        title: title || null,
        phone: phone || null,
        location: location || null
      });

      if (!data.update_user) {
        throw new Error(`User ${userId} not found or could not be updated`);
      }

      return JSON.stringify({
        success: true,
        action: 'updateUser',
        data: data.update_user
      });
    } catch (error) {
      logger.error('[MondayTool] Error updating user:', error);
      throw new Error(`Failed to update user: ${error.message}`);
    }
  }

  async deactivateUser({ userId }) {
    if (!userId) {
      throw new Error('userId is required for deactivateUser action');
    }

    const mutation = `
      mutation deactivateUser($userId: ID!) {
        deactivate_user(user_id: $userId) {
          id
          name
          email
          enabled
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        userId
      });

      if (!data.deactivate_user) {
        throw new Error(`User ${userId} not found or could not be deactivated`);
      }

      return JSON.stringify({
        success: true,
        action: 'deactivateUser',
        data: data.deactivate_user
      });
    } catch (error) {
      logger.error('[MondayTool] Error deactivating user:', error);
      throw new Error(`Failed to deactivate user: ${error.message}`);
    }
  }

  async inviteUser({ email, userKind = 'member', teamIds }) {
    if (!email) {
      throw new Error('email is required for inviteUser action');
    }

    const mutation = `
      mutation inviteUser($email: String!, $userKind: UserKind!, $teamIds: [ID]) {
        invite_user(
          email: $email,
          user_kind: $userKind,
          team_ids: $teamIds
        ) {
          id
          name
          email
          enabled
          teams {
            id
            name
          }
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        email,
        userKind: userKind.toUpperCase(),
        teamIds: teamIds || null
      });

      if (!data.invite_user) {
        throw new Error(`Failed to invite user with email ${email}`);
      }

      return JSON.stringify({
        success: true,
        action: 'inviteUser',
        data: data.invite_user
      });
    } catch (error) {
      logger.error('[MondayTool] Error inviting user:', error);
      throw new Error(`Failed to invite user: ${error.message}`);
    }
  }

  async addUsersToWorkspace({ workspaceId, userIds, userKind = 'member' }) {
    if (!workspaceId || !userIds) {
      throw new Error('workspaceId and userIds are required for addUsersToWorkspace action');
    }

    const mutation = `
      mutation addUsersToWorkspace($workspaceId: ID!, $userIds: [ID!]!, $userKind: UserKind!) {
        add_users_to_workspace(
          workspace_id: $workspaceId,
          user_ids: $userIds,
          user_kind: $userKind
        ) {
          id
          name
          users {
            id
            name
            email
            enabled
          }
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        workspaceId,
        userIds,
        userKind: userKind.toUpperCase()
      });

      if (!data.add_users_to_workspace) {
        throw new Error(`Failed to add users to workspace ${workspaceId}`);
      }

      return JSON.stringify({
        success: true,
        action: 'addUsersToWorkspace',
        data: data.add_users_to_workspace
      });
    } catch (error) {
      logger.error('[MondayTool] Error adding users to workspace:', error);
      throw new Error(`Failed to add users to workspace: ${error.message}`);
    }
  }

  async getAccount() {
    const data = await this.makeGraphQLRequest(userQueries.GET_ACCOUNT);

    return JSON.stringify({
      success: true,
      action: 'getAccount',
      data: data.account
    });
  }

}

module.exports = MondayTool;
