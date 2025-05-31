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
        'Authorization': this.apiKey,
        'API-Version': '2024-10'
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

    // Создаем запрос с условным включением column_values
    let query;
    if (columnValues) {
      query = `
        query getItems($boardId: [ID!]!, $limit: Int!) {
          boards(ids: $boardId) {
            id
            name
            items_page(limit: $limit) {
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
                  type
                  text
                  value
                }
              }
            }
          }
        }
      `;
    } else {
      query = `
        query getItems($boardId: [ID!]!, $limit: Int!) {
          boards(ids: $boardId) {
            id
            name
            items_page(limit: $limit) {
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
              }
            }
          }
        }
      `;
    }

    try {
      const data = await this.makeGraphQLRequest(query, {
        boardId: [boardId],
        limit
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

    // Преобразуем columnValues в правильный формат для Monday.com API
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
          column_values {
            id
            type
            text
            value
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

    // Для Monday.com API значения должны быть в формате JSON строки
    const formattedValue = typeof value === 'string' ? value : JSON.stringify(value);

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
          column_values(ids: [$columnId]) {
            id
            type
            text
            value
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

    // Создаем webhook с правильным GraphQL запросом согласно документации
    const mutation = `
      mutation createWebhook($boardId: ID!, $url: String!, $event: WebhookEventType!, $config: JSON) {
        create_webhook(
          board_id: $boardId,
          url: $url,
          event: $event,
          config: $config
        ) {
          id
          board_id
          event
          config
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        boardId,
        url,
        event,
        config: config || null
      });

      return JSON.stringify({
        success: true,
        action: 'createWebhook',
        data: data.create_webhook
      });
    } catch (error) {
      logger.error('[MondayTool] Error creating webhook:', error);
      throw new Error(`Failed to create webhook: ${error.message}`);
    }
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
  async createNotification({ userId, targetId, text, targetType = 'Project' }) {
    if (!userId || !targetId || !text) {
      throw new Error('userId, targetId, and text are required for createNotification action');
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

  // ============ ФАЗА 3: WORKSPACES И СТРУКТУРА ============

  async createWorkspace({ workspaceName, name, workspaceKind = 'open', description }) {
    const nameToUse = workspaceName || name;
    if (!nameToUse) {
      throw new Error('workspaceName or name is required for createWorkspace action');
    }

    const mutation = `
      mutation createWorkspace($name: String!, $kind: WorkspaceKind!, $description: String) {
        create_workspace(
          name: $name,
          kind: $kind,
          description: $description
        ) {
          id
          name
          description
          kind
          state
          picture_url
          items_count
          boards_count
          users_count
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        name: nameToUse,
        kind: workspaceKind.toUpperCase(),
        description: description || null
      });

      if (!data.create_workspace) {
        throw new Error('Failed to create workspace: Unauthorized');
      }

      return JSON.stringify({
        success: true,
        action: 'createWorkspace',
        data: data.create_workspace
      });
    } catch (error) {
      logger.error('[MondayTool] Error creating workspace:', error);
      throw new Error(`Failed to create workspace: ${error.message}`);
    }
  }

  async getWorkspacesExtended({ limit = 25, ids }) {
    const data = await this.makeGraphQLRequest(workspaceQueries.GET_WORKSPACES_EXTENDED, {
      limit,
      ids
    });

    return JSON.stringify({
      success: true,
      action: 'getWorkspacesExtended',
      data: data.workspaces
    });
  }

  async updateWorkspace({ workspaceId, name, description }) {
    if (!workspaceId) {
      throw new Error('workspaceId is required for updateWorkspace action');
    }

    // Используем разные мутации для обновления разных полей
    let updatedData = { id: workspaceId };
    
    if (name) {
      const updateNameMutation = `
        mutation updateWorkspaceName($workspaceId: ID!, $name: String!) {
          update_workspace(id: $workspaceId, attributes: {name: $name}) {
            id
            name
            description
            kind
            state
          }
        }
      `;
      
      const nameData = await this.makeGraphQLRequest(updateNameMutation, {
        workspaceId,
        name
      });
      
      updatedData = { ...updatedData, ...nameData.update_workspace };
    }
    
    if (description) {
      const updateDescMutation = `
        mutation updateWorkspaceDesc($workspaceId: ID!, $description: String!) {
          update_workspace(id: $workspaceId, attributes: {description: $description}) {
            id
            name
            description
            kind
            state
          }
        }
      `;
      
      const descData = await this.makeGraphQLRequest(updateDescMutation, {
        workspaceId,
        description
      });
      
      updatedData = { ...updatedData, ...descData.update_workspace };
    }

    return JSON.stringify({
      success: true,
      action: 'updateWorkspace',
      data: updatedData
    });
  }

  async deleteWorkspace({ workspaceId }) {
    if (!workspaceId) {
      throw new Error('workspaceId is required for deleteWorkspace action');
    }

    const mutation = `
      mutation deleteWorkspace($workspaceId: ID!) {
        delete_workspace(id: $workspaceId) {
          id
          name
          state
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        workspaceId
      });

      if (!data.delete_workspace) {
        throw new Error(`Workspace ${workspaceId} not found or could not be deleted`);
      }

      return JSON.stringify({
        success: true,
        action: 'deleteWorkspace',
        data: data.delete_workspace
      });
    } catch (error) {
      logger.error('[MondayTool] Error deleting workspace:', error);
      throw new Error(`Failed to delete workspace: ${error.message}`);
    }
  }

  async removeUsersFromWorkspace({ workspaceId, userIds }) {
    if (!workspaceId || !userIds) {
      throw new Error('workspaceId and userIds are required for removeUsersFromWorkspace action');
    }

    const data = await this.makeGraphQLRequest(workspaceQueries.REMOVE_USERS_FROM_WORKSPACE, {
      workspaceId,
      userIds
    });

    return JSON.stringify({
      success: true,
      action: 'removeUsersFromWorkspace',
      data: data.delete_users_from_workspace
    });
  }

  async getFolders({ workspaceId, limit = 25 }) {
    if (!workspaceId) {
      throw new Error('workspaceId is required for getFolders action');
    }

    const data = await this.makeGraphQLRequest(workspaceQueries.GET_FOLDERS, {
      workspaceId,
      limit
    });

    return JSON.stringify({
      success: true,
      action: 'getFolders',
      data: data.folders
    });
  }

  async createFolder({ name, workspaceId, color, parentFolderId }) {
    if (!name || !workspaceId) {
      throw new Error('name and workspaceId are required for createFolder action');
    }

    const data = await this.makeGraphQLRequest(workspaceQueries.CREATE_FOLDER, {
      name,
      workspaceId,
      color,
      parentFolderId
    });

    return JSON.stringify({
      success: true,
      action: 'createFolder',
      data: data.create_folder
    });
  }

  async updateFolder({ folderId, name, color }) {
    if (!folderId) {
      throw new Error('folderId is required for updateFolder action');
    }

    const data = await this.makeGraphQLRequest(workspaceQueries.UPDATE_FOLDER, {
      folderId,
      name,
      color
    });

    return JSON.stringify({
      success: true,
      action: 'updateFolder',
      data: data.update_folder
    });
  }

  async deleteFolder({ folderId }) {
    if (!folderId) {
      throw new Error('folderId is required for deleteFolder action');
    }

    const data = await this.makeGraphQLRequest(workspaceQueries.DELETE_FOLDER, {
      folderId
    });

    return JSON.stringify({
      success: true,
      action: 'deleteFolder',
      data: data.delete_folder
    });
  }

  async archiveBoard({ boardId }) {
    if (!boardId) {
      throw new Error('boardId is required for archiveBoard action');
    }

    const data = await this.makeGraphQLRequest(workspaceQueries.ARCHIVE_BOARD, {
      boardId
    });

    return JSON.stringify({
      success: true,
      action: 'archiveBoard',
      data: data.archive_board
    });
  }

  async duplicateBoard({ boardId, duplicateType = 'duplicate_structure_and_items', boardName, workspaceId, folderId, keepSubscribers = false }) {
    if (!boardId) {
      throw new Error('boardId is required for duplicateBoard action');
    }

    const data = await this.makeGraphQLRequest(workspaceQueries.DUPLICATE_BOARD, {
      boardId,
      duplicateType,
      boardName,
      workspaceId,
      folderId,
      keepSubscribers
    });

    return JSON.stringify({
      success: true,
      action: 'duplicateBoard',
      data: data.duplicate_board
    });
  }

  async createBoardFromTemplate({ templateId, boardName, workspaceId, folderId }) {
    if (!templateId || !boardName) {
      throw new Error('templateId and boardName are required for createBoardFromTemplate action');
    }

    const data = await this.makeGraphQLRequest(workspaceQueries.CREATE_BOARD_FROM_TEMPLATE, {
      templateId,
      boardName,
      workspaceId,
      folderId
    });

    return JSON.stringify({
      success: true,
      action: 'createBoardFromTemplate',
      data: data.create_board_from_template
    });
  }

  // ============ ASSETS И ФАЙЛЫ ============

  async addFileToUpdate({ updateId, file }) {
    if (!updateId || !file) {
      throw new Error('updateId and file are required for addFileToUpdate action');
    }

    const data = await this.makeGraphQLRequest(assetQueries.ADD_FILE_TO_UPDATE, {
      updateId,
      file
    });

    return JSON.stringify({
      success: true,
      action: 'addFileToUpdate',
      data: data.add_file_to_update
    });
  }

  async addFileToColumn({ itemId, columnId, file }) {
    if (!itemId || !columnId || !file) {
      throw new Error('itemId, columnId, and file are required for addFileToColumn action');
    }

    const data = await this.makeGraphQLRequest(assetQueries.ADD_FILE_TO_COLUMN, {
      itemId,
      columnId,
      file
    });

    return JSON.stringify({
      success: true,
      action: 'addFileToColumn',
      data: data.add_file_to_column
    });
  }

  async getUpdateAssets({ updateId }) {
    if (!updateId) {
      throw new Error('updateId is required for getUpdateAssets action');
    }

    const data = await this.makeGraphQLRequest(assetQueries.GET_UPDATE_ASSETS, {
      updateId
    });

    return JSON.stringify({
      success: true,
      action: 'getUpdateAssets',
      data: data.updates[0]?.assets || []
    });
  }

  async getItemAssets({ itemId }) {
    if (!itemId) {
      throw new Error('itemId is required for getItemAssets action');
    }

    const data = await this.makeGraphQLRequest(assetQueries.GET_ITEM_ASSETS, {
      itemId
    });

    return JSON.stringify({
      success: true,
      action: 'getItemAssets',
      data: data.items[0]?.assets || []
    });
  }

  // Получение assets по ID
  async getAssets({ ids }) {
    if (!ids || !Array.isArray(ids)) {
      throw new Error('ids array is required for getAssets action');
    }

    const data = await this.makeGraphQLRequest(assetQueries.GET_ASSETS, {
      ids
    });

    return JSON.stringify({
      success: true,
      action: 'getAssets',
      data: data.assets
    });
  }

  // Получение assets для доски
  async getBoardAssets({ boardId, limit = 25 }) {
    if (!boardId) {
      throw new Error('boardId is required for getBoardAssets action');
    }

    const data = await this.makeGraphQLRequest(assetQueries.GET_BOARD_ASSETS, {
      boardId: [boardId],
      limit
    });

    return JSON.stringify({
      success: true,
      action: 'getBoardAssets',
      data: data.boards[0]?.items_page?.items || []
    });
  }

  // Получение публичного URL для asset
  async getAssetPublicUrl({ assetId }) {
    if (!assetId) {
      throw new Error('assetId is required for getAssetPublicUrl action');
    }

    const data = await this.makeGraphQLRequest(assetQueries.GET_ASSET_PUBLIC_URL, {
      assetId: [assetId]
    });

    return JSON.stringify({
      success: true,
      action: 'getAssetPublicUrl',
      data: data.assets[0]
    });
  }

  // Поиск assets в рамках доски
  async searchBoardAssets({ boardId, limit = 25 }) {
    if (!boardId) {
      throw new Error('boardId is required for searchBoardAssets action');
    }

    const data = await this.makeGraphQLRequest(assetQueries.SEARCH_BOARD_ASSETS, {
      boardId: [boardId],
      limit
    });

    return JSON.stringify({
      success: true,
      action: 'searchBoardAssets',
      data: data.boards[0]?.items_page?.items || []
    });
  }

  async getAssetThumbnail({ assetId }) {
    if (!assetId) {
      throw new Error('assetId is required for getAssetThumbnail action');
    }

    const data = await this.makeGraphQLRequest(assetQueries.GET_ASSET_THUMBNAIL, {
      assetId: [assetId]
    });

    return JSON.stringify({
      success: true,
      action: 'getAssetThumbnail',
      data: data.assets[0] || null
    });
  }

  // Методы поиска - ИСПРАВЛЕННАЯ ВЕРСИЯ
  async searchItems({ boardId, query, limit = 25 }) {
    if (!boardId || !query) {
      throw new Error('boardId and query are required for searchItems action');
    }

    // Monday.com API не имеет прямого поиска items_page_by_column_values
    // Вместо этого используем обычное получение элементов с фильтрацией на стороне клиента
    const searchQuery = `
      query searchItems($boardId: [ID!]!, $limit: Int!) {
        boards(ids: $boardId) {
          id
          name
          items_page(limit: $limit) {
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
                type
                text
                value
              }
            }
          }
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(searchQuery, {
        boardId: [boardId],
        limit: Math.min(limit * 3, 500) // Получаем больше элементов для фильтрации
      });

      const board = data.boards?.[0];
      if (!board) {
        throw new Error(`Board ${boardId} not found`);
      }

      const allItems = board.items_page?.items || [];
      
      // Фильтруем элементы на стороне клиента
      const filteredItems = allItems.filter(item => {
        // Ищем по названию элемента
        if (item.name && item.name.toLowerCase().includes(query.toLowerCase())) {
          return true;
        }
        
        // Ищем по значениям колонок
        if (item.column_values) {
          return item.column_values.some(col => 
            col.text && col.text.toLowerCase().includes(query.toLowerCase())
          );
        }
        
        return false;
      }).slice(0, limit); // Ограничиваем результат

      return JSON.stringify({
        success: true,
        action: 'searchItems',
        data: filteredItems,
        total: filteredItems.length,
        query: query
      });
    } catch (error) {
      logger.error('[MondayTool] Error searching items:', error);
      throw new Error(`Failed to search items: ${error.message}`);
    }
  }

  // ============ РАСШИРЕННЫЕ ОПЕРАЦИИ С КОЛОНКАМИ И ГРУППАМИ ============

  async createColumn({ boardId, title, columnType, defaults }) {
    if (!boardId || !title || !columnType) {
      throw new Error('boardId, title, and columnType are required for createColumn action');
    }

    const data = await this.makeGraphQLRequest(advancedQueries.CREATE_COLUMN, {
      boardId,
      title,
      columnType,
      defaults
    });

    return JSON.stringify({
      success: true,
      action: 'createColumn',
      data: data.create_column
    });
  }

  // Обновление заголовка колонки
  async updateColumnTitle({ boardId, columnId, title }) {
    if (!boardId || !columnId || !title) {
      throw new Error('boardId, columnId, and title are required for updateColumnTitle action');
    }

    const data = await this.makeGraphQLRequest(advancedQueries.UPDATE_COLUMN_TITLE, {
      boardId,
      columnId,
      title
    });

    return JSON.stringify({
      success: true,
      action: 'updateColumnTitle',
      data: data.change_column_title
    });
  }

  async deleteColumn({ boardId, columnId }) {
    if (!boardId || !columnId) {
      throw new Error('boardId and columnId are required for deleteColumn action');
    }

    const mutation = `
      mutation deleteColumn($boardId: ID!, $columnId: String!) {
        delete_column(
          board_id: $boardId,
          column_id: $columnId
        ) {
          id
          name
          type
          archived
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        boardId,
        columnId
      });

      if (!data.delete_column) {
        throw new Error(`Column ${columnId} not found or could not be deleted`);
      }

      return JSON.stringify({
        success: true,
        action: 'deleteColumn',
        data: data.delete_column
      });
    } catch (error) {
      logger.error('[MondayTool] Error deleting column:', error);
      throw new Error(`Failed to delete column: ${error.message}`);
    }
  }

  // Изменение значения колонки
  async changeColumnValue({ boardId, itemId, columnId, value, createLabelsIfMissing = false }) {
    if (!boardId || !itemId || !columnId || value === undefined) {
      throw new Error('boardId, itemId, columnId, and value are required for changeColumnValue action');
    }

    const formattedValue = JSON.stringify(value);

    const mutation = `
      mutation changeColumnValue($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!, $createLabelsIfMissing: Boolean) {
        change_column_value(
          board_id: $boardId,
          item_id: $itemId,
          columnId: $columnId,
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

      if (!data.change_column_value) {
        throw new Error(`Failed to change column value for item ${itemId}`);
      }

      return JSON.stringify({
        success: true,
        action: 'changeColumnValue',
        data: data.change_column_value
      });
    } catch (error) {
      logger.error('[MondayTool] Error changing column value:', error);
      throw new Error(`Failed to change column value: ${error.message}`);
    }
  }

  // Изменение простого значения колонки
  async changeSimpleColumnValue({ boardId, itemId, columnId, value, createLabelsIfMissing = false }) {
    if (!boardId || !itemId || !columnId || value === undefined) {
      throw new Error('boardId, itemId, columnId, and value are required for changeSimpleColumnValue action');
    }

    const mutation = `
      mutation changeSimpleColumnValue($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!, $createLabelsIfMissing: Boolean) {
        change_simple_column_value(
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
        value: String(value),
        createLabelsIfMissing
      });

      if (!data.change_simple_column_value) {
        throw new Error(`Failed to change simple column value for item ${itemId}`);
      }

      return JSON.stringify({
        success: true,
        action: 'changeSimpleColumnValue',
        data: data.change_simple_column_value
      });
    } catch (error) {
      logger.error('[MondayTool] Error changing simple column value:', error);
      throw new Error(`Failed to change simple column value: ${error.message}`);
    }
  }

  // Изменение нескольких значений колонок
  async changeMultipleColumnValues({ boardId, itemId, columnValues, createLabelsIfMissing = false }) {
    if (!boardId || !itemId || !columnValues) {
      throw new Error('boardId, itemId, and columnValues are required for changeMultipleColumnValues action');
    }

    const formattedColumnValues = JSON.stringify(columnValues);

    const mutation = `
      mutation changeMultipleColumnValues($boardId: ID!, $itemId: ID!, $columnValues: JSON!, $createLabelsIfMissing: Boolean) {
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

      if (!data.change_multiple_column_values) {
        throw new Error(`Failed to change multiple column values for item ${itemId}`);
      }

      return JSON.stringify({
        success: true,
        action: 'changeMultipleColumnValues',
        data: data.change_multiple_column_values
      });
    } catch (error) {
      logger.error('[MondayTool] Error changing multiple column values:', error);
      throw new Error(`Failed to change multiple column values: ${error.message}`);
    }
  }

  async createGroupAdvanced({ boardId, groupName, color, position }) {
    if (!boardId || !groupName) {
      throw new Error('boardId and groupName are required for createGroupAdvanced action');
    }

    const mutation = `
      mutation createGroup($boardId: ID!, $groupName: String!, $color: String, $position: String) {
        create_group(
          board_id: $boardId,
          group_name: $groupName,
          group_color: $color,
          position: $position
        ) {
          id
          title
          color
          position
          items {
            id
            name
          }
          archived
          deleted
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        boardId,
        groupName,
        color: color || null,
        position: position || null
      });

      if (!data.create_group) {
        throw new Error(`Failed to create group ${groupName} in board ${boardId}`);
      }

      return JSON.stringify({
        success: true,
        action: 'createGroupAdvanced',
        data: data.create_group
      });
    } catch (error) {
      logger.error('[MondayTool] Error creating group:', error);
      throw new Error(`Failed to create group: ${error.message}`);
    }
  }

  async updateGroup({ boardId, groupId, groupName, color }) {
    if (!boardId || !groupId) {
      throw new Error('boardId and groupId are required for updateGroup action');
    }

    const mutation = `
      mutation updateGroup($boardId: ID!, $groupId: String!, $groupName: String, $color: String) {
        update_group(
          board_id: $boardId,
          group_id: $groupId,
          group_name: $groupName,
          group_color: $color
        ) {
          id
          title
          color
          position
          items {
            id
            name
          }
          archived
          deleted
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        boardId,
        groupId,
        groupName: groupName || null,
        color: color || null
      });

      if (!data.update_group) {
        throw new Error(`Failed to update group ${groupId} in board ${boardId}`);
      }

      return JSON.stringify({
        success: true,
        action: 'updateGroup',
        data: data.update_group
      });
    } catch (error) {
      logger.error('[MondayTool] Error updating group:', error);
      throw new Error(`Failed to update group: ${error.message}`);
    }
  }

  async deleteGroup({ boardId, groupId }) {
    if (!boardId || !groupId) {
      throw new Error('boardId and groupId are required for deleteGroup action');
    }

    const mutation = `
      mutation deleteGroup($boardId: ID!, $groupId: String!) {
        delete_group(
          board_id: $boardId,
          group_id: $groupId
        ) {
          id
          title
          archived
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        boardId,
        groupId
      });

      if (!data.delete_group) {
        throw new Error(`Group ${groupId} not found or could not be deleted`);
      }

      return JSON.stringify({
        success: true,
        action: 'deleteGroup',
        data: data.delete_group
      });
    } catch (error) {
      logger.error('[MondayTool] Error deleting group:', error);
      throw new Error(`Failed to delete group: ${error.message}`);
    }
  }

  async duplicateGroup({ boardId, groupId, groupName, addToTop = false }) {
    if (!boardId || !groupId) {
      throw new Error('boardId and groupId are required for duplicateGroup action');
    }

    const mutation = `
      mutation duplicateGroup($boardId: ID!, $groupId: String!, $groupName: String, $addToTop: Boolean) {
        duplicate_group(
          board_id: $boardId,
          group_id: $groupId,
          group_name: $groupName,
          add_to_top: $addToTop
        ) {
          id
          title
          color
          position
          items {
            id
            name
          }
          archived
          deleted
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        boardId,
        groupId,
        groupName: groupName || null,
        addToTop
      });

      if (!data.duplicate_group) {
        throw new Error(`Failed to duplicate group ${groupId} in board ${boardId}`);
      }

      return JSON.stringify({
        success: true,
        action: 'duplicateGroup',
        data: data.duplicate_group
      });
    } catch (error) {
      logger.error('[MondayTool] Error duplicating group:', error);
      throw new Error(`Failed to duplicate group: ${error.message}`);
    }
  }

  async archiveGroup({ boardId, groupId }) {
    if (!boardId || !groupId) {
      throw new Error('boardId and groupId are required for archiveGroup action');
    }

    const mutation = `
      mutation archiveGroup($boardId: ID!, $groupId: String!) {
        archive_group(board_id: $boardId, group_id: $groupId) {
          id
          title
          color
          position
          archived
          deleted
          items {
            id
            name
            state
          }
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        boardId,
        groupId
      });

      if (!data.archive_group) {
        throw new Error(`Failed to archive group ${groupId}`);
      }

      return JSON.stringify({
        success: true,
        action: 'archiveGroup',
        data: data.archive_group
      });
    } catch (error) {
      logger.error('[MondayTool] Error archiving group:', error);
      throw new Error(`Failed to archive group: ${error.message}`);
    }
  }

  async moveItemToGroup({ itemId, groupId }) {
    if (!itemId || !groupId) {
      throw new Error('itemId and groupId are required for moveItemToGroup action');
    }

    const mutation = `
      mutation moveItemToGroup($itemId: ID!, $groupId: String!) {
        move_item_to_group(
          item_id: $itemId,
          group_id: $groupId
        ) {
          id
          name
          state
          created_at
          updated_at
          group {
            id
            title
            color
            position
            archived
          }
          board {
            id
            name
            state
          }
          column_values {
            id
            title
            type
            text
            value
          }
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        itemId,
        groupId
      });

      if (!data.move_item_to_group) {
        throw new Error(`Failed to move item ${itemId} to group ${groupId}`);
      }

      return JSON.stringify({
        success: true,
        action: 'moveItemToGroup',
        data: data.move_item_to_group
      });
    } catch (error) {
      logger.error('[MondayTool] Error moving item to group:', error);
      throw new Error(`Failed to move item to group: ${error.message}`);
    }
  }

  async getGroupsExtended({ boardId }) {
    if (!boardId) {
      throw new Error('boardId is required for getGroupsExtended action');
    }

    const query = `
      query getGroupsExtended($boardId: [ID!]!) {
        boards(ids: $boardId) {
          groups {
            id
            title
            color
            position
            archived
            deleted
            items_page(limit: 25) {
              cursor
              total
              items {
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
                  state
                }
              }
            }
          }
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(query, {
        boardId: [boardId]
      });

      if (!data.boards || data.boards.length === 0) {
        throw new Error(`Board ${boardId} not found`);
      }

      const groups = data.boards[0]?.groups || [];
      const totalItems = groups.reduce((sum, group) => sum + (group.items_page?.total || 0), 0);

      return JSON.stringify({
        success: true,
        action: 'getGroupsExtended',
        data: groups,
        total: groups.length,
        totalItems
      });
    } catch (error) {
      logger.error('[MondayTool] Error getting extended groups:', error);
      throw new Error(`Failed to get extended groups: ${error.message}`);
    }
  }

  async getColumnSettings({ boardId, columnId }) {
    if (!boardId) {
      throw new Error('boardId is required for getColumnSettings action');
    }

    const query = `
      query getColumnSettings($boardId: [ID!]!, $columnIds: [String!]) {
        boards(ids: $boardId) {
          columns(ids: $columnIds) {
            id
            title
            type
            settings_str
            description
            width
            archived
          }
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(query, {
        boardId: [boardId],
        columnIds: columnId ? [columnId] : null
      });

      if (!data.boards || data.boards.length === 0) {
        throw new Error(`Board ${boardId} not found`);
      }

      const columns = data.boards[0]?.columns || [];

      return JSON.stringify({
        success: true,
        action: 'getColumnSettings',
        data: columns
      });
    } catch (error) {
      logger.error('[MondayTool] Error getting column settings:', error);
      throw new Error(`Failed to get column settings: ${error.message}`);
    }
  }

  async changeColumnMetadata({ boardId, columnId, columnProperty, value }) {
    if (!boardId || !columnId || !columnProperty || !value) {
      throw new Error('boardId, columnId, columnProperty, and value are required for changeColumnMetadata action');
    }

    const mutation = `
      mutation changeColumnMetadata($boardId: ID!, $columnId: String!, $columnProperty: ColumnProperty!, $value: String!) {
        change_column_metadata(
          board_id: $boardId,
          column_id: $columnId,
          column_property: $columnProperty,
          value: $value
        ) {
          id
          title
          description
          settings_str
          type
          width
          archived
        }
      }
    `;

    try {
      const data = await this.makeGraphQLRequest(mutation, {
        boardId,
        columnId,
        columnProperty: columnProperty.toUpperCase(),
        value: String(value)
      });

      if (!data.change_column_metadata) {
        throw new Error(`Failed to change column metadata for column ${columnId}`);
      }

      return JSON.stringify({
        success: true,
        action: 'changeColumnMetadata',
        data: data.change_column_metadata
      });
    } catch (error) {
      logger.error('[MondayTool] Error changing column metadata:', error);
      throw new Error(`Failed to change column metadata: ${error.message}`);
    }
  }

  // ============ СЛУЖЕБНЫЕ МЕТОДЫ ============

  /**
   * Метод для кэширования частых запросов
   */
  async getCachedData(cacheKey, queryFunction, ttl = 300000) { // 5 минут по умолчанию
    try {
      // Простейшая реализация кэша в памяти
      if (!this.cache) {
        this.cache = new Map();
      }

      const cached = this.cache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < ttl) {
        logger.debug(`[MondayTool] Cache hit for key: ${cacheKey}`);
        return cached.data;
      }

      const data = await queryFunction();
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      logger.debug(`[MondayTool] Cache miss, data stored for key: ${cacheKey}`);
      return data;
    } catch (error) {
      logger.error('[MondayTool] Cache error:', error);
      return await queryFunction(); // Fallback to direct query
    }
  }

  /**
   * Метод для массовых операций
   */
  async batchOperation(operations) {
    const results = [];
    const batchSize = 5; // Ограничение concurrent запросов

    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      const batchPromises = batch.map(async (operation) => {
        try {
          return await this._call(operation);
        } catch (error) {
          return {
            error: error.message,
            operation: operation.action
          };
        }
      });
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return JSON.stringify({
      success: true,
      action: 'batchOperation',
      data: results,
      total: results.length
    });
  }

  /**
   * Получение информации о лимитах API
   */
  async getApiLimits() {
    const query = `
      query {
        complexity {
          before
          after
          query
        }
      }
    `;

    const data = await this.makeGraphQLRequest(query);
    
    return JSON.stringify({
      success: true,
      action: 'getApiLimits',
      data: data.complexity
    });
  }

  /**
   * Валидация webhook URL
   */
  validateWebhookUrl(url) {
    try {
      const webhookUrl = new URL(url);
      return webhookUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Метод для выполнения множественных операций параллельно (batch processing)
   * Ограничиваем до 5 одновременных запросов для соблюдения rate limits monday.com
   */
  async performBatchOperations(requests, concurrencyLimit = 5) {
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new Error('requests должен быть непустым массивом');
    }

    logger.debug(`[MondayTool] Выполнение batch операций: ${requests.length} запросов с лимитом ${concurrencyLimit}`);

    const results = [];
    const errors = [];

    // Разбиваем запросы на группы для контроля нагрузки
    for (let i = 0; i < requests.length; i += concurrencyLimit) {
      const batch = requests.slice(i, i + concurrencyLimit);
      
      const batchPromises = batch.map(async (request, index) => {
        try {
          const startTime = Date.now();
          const result = await this._call(request);
          const endTime = Date.now();
          
          logger.debug(`[MondayTool] Batch request ${i + index + 1} completed in ${endTime - startTime}ms`);
          
          return {
            index: i + index,
            success: true,
            result: JSON.parse(result),
            request,
            executionTime: endTime - startTime
          };
        } catch (error) {
          logger.error(`[MondayTool] Batch request ${i + index + 1} failed:`, error);
          
          return {
            index: i + index,
            success: false,
            error: error.message,
            request,
            executionTime: 0
          };
        }
      });

      // Ждем завершения текущей группы запросов
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((promiseResult, batchIndex) => {
        if (promiseResult.status === 'fulfilled') {
          if (promiseResult.value.success) {
            results.push(promiseResult.value);
          } else {
            errors.push(promiseResult.value);
          }
        } else {
          errors.push({
            index: i + batchIndex,
            success: false,
            error: promiseResult.reason?.message || 'Unknown error',
            request: batch[batchIndex],
            executionTime: 0
          });
        }
      });

      // Небольшая пауза между группами для соблюдения rate limits
      if (i + concurrencyLimit < requests.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const totalExecutionTime = results.reduce((sum, result) => sum + result.executionTime, 0);
    const avgExecutionTime = results.length > 0 ? totalExecutionTime / results.length : 0;

    logger.info(`[MondayTool] Batch операции завершены: ${results.length} успешных, ${errors.length} ошибок, среднее время: ${avgExecutionTime.toFixed(2)}ms`);

    return {
      success: errors.length === 0,
      totalRequests: requests.length,
      successfulRequests: results.length,
      failedRequests: errors.length,
      results,
      errors,
      executionStats: {
        totalExecutionTime,
        averageExecutionTime: avgExecutionTime,
        concurrencyLimit
      }
    };
  }

  /**
   * Метод для мониторинга API лимитов
   */
  async checkApiLimits() {
    try {
      // monday.com возвращает информацию о лимитах в заголовках ответа
      const data = await this.makeGraphQLRequest('{ me { id } }');
      
      return {
        success: true,
        limitsAvailable: true,
        message: 'API доступен'
      };
    } catch (error) {
      if (error.message.includes('429') || error.message.includes('rate limit')) {
        return {
          success: false,
          limitsAvailable: false,
          message: 'API лимиты исчерпаны, требуется пауза'
        };
      }
      
      return {
        success: false,
        limitsAvailable: false,
        message: `Ошибка проверки API: ${error.message}`
      };
    }
  }

  /**
   * Простой кэш для часто запрашиваемых данных
   */
  _initializeCache() {
    if (!this._cache) {
      this._cache = new Map();
      this._cacheTimestamps = new Map();
      this._cacheExpiry = 5 * 60 * 1000; // 5 минут
    }
  }

  _getCachedData(key) {
    this._initializeCache();
    
    const timestamp = this._cacheTimestamps.get(key);
    if (timestamp && (Date.now() - timestamp) < this._cacheExpiry) {
      return this._cache.get(key);
    }
    
    return null;
  }

  _setCachedData(key, data) {
    this._initializeCache();
    
    this._cache.set(key, data);
    this._cacheTimestamps.set(key, Date.now());
  }

  _clearCache() {
    if (this._cache) {
      this._cache.clear();
      this._cacheTimestamps.clear();
    }
  }

  /**
   * Форматирование ответа для агента (существующий метод)
   */
  formatAgentResponse(data, action) {
    return {
      success: true,
      action,
      data,
      timestamp: new Date().toISOString(),
      apiVersion: '2024-01'
    };
  }
}

module.exports = MondayTool;