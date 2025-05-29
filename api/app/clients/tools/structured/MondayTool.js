const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const fetch = require('node-fetch');
const { logger } = require('../../../../config');

// Импорт всех модулей для расширенных возможностей
const webhookQueries = require('./utils/mondayWebhooks');
const updateQueries = require('./utils/mondayUpdates');
const teamQueries = require('./utils/mondayTeams');
const workspaceQueries = require('./utils/mondayWorkspaces');
const assetQueries = require('./utils/mondayAssets');
const advancedQueries = require('./utils/mondayAdvanced');

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
        'getWebhookLogs',
        'testWebhook',
        'createUpdate',
        'getUpdates',
        'getBoardUpdates',
        'createUpdateReply',
        'deleteUpdate',
        'likeUpdate',
        'unlikeUpdate',
        'getUserNotifications',
        'markNotificationRead',
        'markAllNotificationsRead',
        
        // ФАЗА 2: Teams и Users Management
        'createTeam',
        'getTeams',
        'getTeam',
        'addUserToTeam',
        'removeUserFromTeam',
        'updateTeam',
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
        'moveBoardToFolder',
        'archiveBoard',
        'unarchiveBoard',
        'duplicateBoard',
        'getBoardTemplates',
        'createBoardFromTemplate',
        
        // Assets и файлы
        'addFileToUpdate',
        'addFileToColumn',
        'getUpdateAssets',
        'getItemAssets',
        'deleteAsset',
        'getWorkspaceAssets',
        'createAssetPublicUrl',
        'searchAssets',
        'getAssetThumbnail',
        
        // Расширенные операции с колонками и группами
        'createColumn',
        'updateColumnAdvanced',
        'deleteColumn',
        'duplicateColumn',
        'moveColumn',
        'createGroupAdvanced',
        'updateGroup',
        'deleteGroup',
        'duplicateGroup',
        'archiveGroup',
        'moveGroup',
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
        case 'getWebhookLogs':
          return await this.getWebhookLogs(parsedInput);
        case 'testWebhook':
          return await this.testWebhook(parsedInput);

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
        case 'markNotificationRead':
          return await this.markNotificationRead(parsedInput);
        case 'markAllNotificationsRead':
          return await this.markAllNotificationsRead(parsedInput);

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
        case 'updateTeam':
          return await this.updateTeam(parsedInput);
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
        case 'moveBoardToFolder':
          return await this.moveBoardToFolder(parsedInput);
        case 'archiveBoard':
          return await this.archiveBoard(parsedInput);
        case 'unarchiveBoard':
          return await this.unarchiveBoard(parsedInput);
        case 'duplicateBoard':
          return await this.duplicateBoard(parsedInput);
        case 'getBoardTemplates':
          return await this.getBoardTemplates(parsedInput);
        case 'createBoardFromTemplate':
          return await this.createBoardFromTemplate(parsedInput);

        // Assets и файлы
        case 'addFileToUpdate':
          return await this.addFileToUpdate(parsedInput);
        case 'addFileToColumn':
          return await this.addFileToColumn(parsedInput);
        case 'getUpdateAssets':
          return await this.getUpdateAssets(parsedInput);
        case 'getItemAssets':
          return await this.getItemAssets(parsedInput);
        case 'deleteAsset':
          return await this.deleteAsset(parsedInput);
        case 'getWorkspaceAssets':
          return await this.getWorkspaceAssets(parsedInput);
        case 'createAssetPublicUrl':
          return await this.createAssetPublicUrl(parsedInput);
        case 'searchAssets':
          return await this.searchAssets(parsedInput);
        case 'getAssetThumbnail':
          return await this.getAssetThumbnail(parsedInput);

        // Расширенные операции с колонками и группами
        case 'createColumn':
          return await this.createColumn(parsedInput);
        case 'updateColumnAdvanced':
          return await this.updateColumnAdvanced(parsedInput);
        case 'deleteColumn':
          return await this.deleteColumn(parsedInput);
        case 'duplicateColumn':
          return await this.duplicateColumn(parsedInput);
        case 'moveColumn':
          return await this.moveColumn(parsedInput);
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
        case 'moveGroup':
          return await this.moveGroup(parsedInput);
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
          items_page(limit: 10) @include(if: $includeItems) {
            cursor
            items {
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
      }
    `;

    const data = await this.makeGraphQLRequest(query, {
      boardId: [boardId],
      limit,
      columnValues
    });

    let items = data.boards[0]?.items_page?.items || [];
    
    // Фильтрация по группе, если указана
    if (groupId) {
      items = items.filter(item => item.group?.id === groupId);
    }

    return JSON.stringify({
      success: true,
      action: 'getItems',
      data: items,
      total: items.length,
      cursor: data.boards[0]?.items_page?.cursor
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

  async updateItem({ boardId, itemId, columnValues }) {
    if (!boardId || !itemId || !columnValues) {
      throw new Error('boardId, itemId and columnValues are required for updateItem action');
    }

    const mutation = `
      mutation updateItem($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
        change_multiple_column_values(
          board_id: $boardId,
          item_id: $itemId,
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
      boardId: parseInt(boardId),
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
  async searchItems({ boardId, query }) {
    if (!boardId || !query) {
      throw new Error('boardId and query are required for searchItems action');
    }

    const searchQuery = `
      query searchItems($boardId: ID!, $query: String!) {
        items_page_by_column_values(
          limit: 25,
          board_id: $boardId,
          columns: [
            {
              column_id: "name",
              column_values: [$query]
            }
          ]
        ) {
          cursor
          items {
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
      }
    `;

    const data = await this.makeGraphQLRequest(searchQuery, {
      boardId: parseInt(boardId),
      query
    });

    return JSON.stringify({
      success: true,
      action: 'searchItems',
      data: data.items_page_by_column_values?.items || [],
      total: data.items_page_by_column_values?.items?.length || 0,
      cursor: data.items_page_by_column_values?.cursor
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

    const data = await this.makeGraphQLRequest(webhookQueries.DELETE_WEBHOOK, {
      id: webhookId
    });

    return JSON.stringify({
      success: true,
      action: 'deleteWebhook',
      data: data.delete_webhook
    });
  }

  async getWebhookLogs({ webhookId, limit = 25 }) {
    if (!webhookId) {
      throw new Error('webhookId is required for getWebhookLogs action');
    }

    const data = await this.makeGraphQLRequest(webhookQueries.GET_WEBHOOK_LOGS, {
      webhookId,
      limit
    });

    return JSON.stringify({
      success: true,
      action: 'getWebhookLogs',
      data: data.webhook_logs
    });
  }

  async testWebhook({ webhookId }) {
    if (!webhookId) {
      throw new Error('webhookId is required for testWebhook action');
    }

    const data = await this.makeGraphQLRequest(webhookQueries.TEST_WEBHOOK, {
      webhookId
    });

    return JSON.stringify({
      success: true,
      action: 'testWebhook',
      data: data.test_webhook
    });
  }

  // ============ ФАЗА 1: UPDATES И УВЕДОМЛЕНИЯ МЕТОДЫ ============

  async createUpdate({ itemId, body }) {
    if (!itemId || !body) {
      throw new Error('itemId and body are required for createUpdate action');
    }

    const data = await this.makeGraphQLRequest(updateQueries.CREATE_UPDATE, {
      itemId,
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

    const data = await this.makeGraphQLRequest(updateQueries.CREATE_UPDATE_REPLY, {
      updateId,
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

  async markNotificationRead({ notificationId }) {
    if (!notificationId) {
      throw new Error('notificationId is required for markNotificationRead action');
    }

    const data = await this.makeGraphQLRequest(updateQueries.MARK_NOTIFICATION_READ, {
      id: notificationId
    });

    return JSON.stringify({
      success: true,
      action: 'markNotificationRead',
      data: data.mark_notification_as_read
    });
  }

  async markAllNotificationsRead() {
    const data = await this.makeGraphQLRequest(updateQueries.MARK_ALL_NOTIFICATIONS_READ);

    return JSON.stringify({
      success: true,
      action: 'markAllNotificationsRead',
      data: data.mark_all_notifications_as_read
    });
  }

  // ============ ФАЗА 2: TEAMS И USERS МЕТОДЫ ============

  async createTeam({ teamName, name, description, pictureUrl }) {
    const teamNameToUse = teamName || name;
    if (!teamNameToUse) {
      throw new Error('teamName or name is required for createTeam action');
    }

    const data = await this.makeGraphQLRequest(teamQueries.CREATE_TEAM, {
      name: teamNameToUse,
      description,
      picture_url: pictureUrl
    });

    return JSON.stringify({
      success: true,
      action: 'createTeam',
      data: data.create_team
    });
  }

  async getTeams({ limit = 25, page = 1 }) {
    const data = await this.makeGraphQLRequest(teamQueries.GET_TEAMS, {
      limit,
      page
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
      id: teamId
    });

    return JSON.stringify({
      success: true,
      action: 'getTeam',
      data: data.teams[0] || null
    });
  }

  async addUserToTeam({ teamId, userId }) {
    if (!teamId || !userId) {
      throw new Error('teamId and userId are required for addUserToTeam action');
    }

    const data = await this.makeGraphQLRequest(teamQueries.ADD_USER_TO_TEAM, {
      teamId,
      userId
    });

    return JSON.stringify({
      success: true,
      action: 'addUserToTeam',
      data: data.add_users_to_team
    });
  }

  async removeUserFromTeam({ teamId, userId }) {
    if (!teamId || !userId) {
      throw new Error('teamId and userId are required for removeUserFromTeam action');
    }

    const data = await this.makeGraphQLRequest(teamQueries.REMOVE_USER_FROM_TEAM, {
      teamId,
      userId
    });

    return JSON.stringify({
      success: true,
      action: 'removeUserFromTeam',
      data: data.remove_users_from_team
    });
  }

  async updateTeam({ teamId, name, description, pictureUrl }) {
    if (!teamId) {
      throw new Error('teamId is required for updateTeam action');
    }

    const data = await this.makeGraphQLRequest(teamQueries.UPDATE_TEAM, {
      teamId,
      name,
      description,
      picture_url: pictureUrl
    });

    return JSON.stringify({
      success: true,
      action: 'updateTeam',
      data: data.update_team
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

  async getUsersExtended({ limit = 25, page = 1, emails, ids }) {
    const data = await this.makeGraphQLRequest(teamQueries.GET_USERS_EXTENDED, {
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

  async inviteUser({ email, userKind = 'member', teamIds }) {
    if (!email) {
      throw new Error('email is required for inviteUser action');
    }

    const data = await this.makeGraphQLRequest(teamQueries.INVITE_USER, {
      email,
      kind: userKind,
      teamIds
    });

    return JSON.stringify({
      success: true,
      action: 'inviteUser',
      data: data.add_users_to_workspace
    });
  }

  async updateUser({ userId, name, title, phone, location }) {
    if (!userId) {
      throw new Error('userId is required for updateUser action');
    }

    const data = await this.makeGraphQLRequest(teamQueries.UPDATE_USER, {
      userId,
      name,
      title,
      phone,
      location
    });

    return JSON.stringify({
      success: true,
      action: 'updateUser',
      data: data.update_user
    });
  }

  async deactivateUser({ userId }) {
    if (!userId) {
      throw new Error('userId is required for deactivateUser action');
    }

    const data = await this.makeGraphQLRequest(teamQueries.DEACTIVATE_USER, {
      userId
    });

    return JSON.stringify({
      success: true,
      action: 'deactivateUser',
      data: data.delete_users_from_workspace
    });
  }

  async getAccount() {
    const data = await this.makeGraphQLRequest(teamQueries.GET_ACCOUNT);

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

    const data = await this.makeGraphQLRequest(workspaceQueries.CREATE_WORKSPACE, {
      name: nameToUse,
      kind: workspaceKind,
      description
    });

    return JSON.stringify({
      success: true,
      action: 'createWorkspace',
      data: data.create_workspace
    });
  }

  async getWorkspacesExtended({ limit = 25, page = 1, ids }) {
    const data = await this.makeGraphQLRequest(workspaceQueries.GET_WORKSPACES_EXTENDED, {
      limit,
      page,
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

    const data = await this.makeGraphQLRequest(workspaceQueries.UPDATE_WORKSPACE, {
      workspaceId,
      name,
      description
    });

    return JSON.stringify({
      success: true,
      action: 'updateWorkspace',
      data: data.update_workspace
    });
  }

  async deleteWorkspace({ workspaceId }) {
    if (!workspaceId) {
      throw new Error('workspaceId is required for deleteWorkspace action');
    }

    const data = await this.makeGraphQLRequest(workspaceQueries.DELETE_WORKSPACE, {
      workspaceId
    });

    return JSON.stringify({
      success: true,
      action: 'deleteWorkspace',
      data: data.delete_workspace
    });
  }

  async addUsersToWorkspace({ workspaceId, userIds, userKind = 'member' }) {
    if (!workspaceId || !userIds) {
      throw new Error('workspaceId and userIds are required for addUsersToWorkspace action');
    }

    const data = await this.makeGraphQLRequest(workspaceQueries.ADD_USERS_TO_WORKSPACE, {
      workspaceId,
      userIds,
      kind: userKind
    });

    return JSON.stringify({
      success: true,
      action: 'addUsersToWorkspace',
      data: data.add_users_to_workspace
    });
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

  async moveBoardToFolder({ boardId, folderId }) {
    if (!boardId) {
      throw new Error('boardId is required for moveBoardToFolder action');
    }

    const data = await this.makeGraphQLRequest(workspaceQueries.MOVE_BOARD_TO_FOLDER, {
      boardId,
      folderId
    });

    return JSON.stringify({
      success: true,
      action: 'moveBoardToFolder',
      data: data.move_board_to_folder
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

  async unarchiveBoard({ boardId }) {
    if (!boardId) {
      throw new Error('boardId is required for unarchiveBoard action');
    }

    const data = await this.makeGraphQLRequest(workspaceQueries.UNARCHIVE_BOARD, {
      boardId
    });

    return JSON.stringify({
      success: true,
      action: 'unarchiveBoard',
      data: data.unarchive_board
    });
  }

  async duplicateBoard({ boardId, duplicateType = 'duplicate_structure_and_items', boardName, workspaceId, folderId, keepSubscribers = false }) {
    if (!boardId || !boardName) {
      throw new Error('boardId and boardName are required for duplicateBoard action');
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

  async getBoardTemplates({ limit = 25 }) {
    const data = await this.makeGraphQLRequest(workspaceQueries.GET_BOARD_TEMPLATES, {
      limit
    });

    return JSON.stringify({
      success: true,
      action: 'getBoardTemplates',
      data: data.board_templates
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

  async deleteAsset({ assetId }) {
    if (!assetId) {
      throw new Error('assetId is required for deleteAsset action');
    }

    const data = await this.makeGraphQLRequest(assetQueries.DELETE_ASSET, {
      assetId
    });

    return JSON.stringify({
      success: true,
      action: 'deleteAsset',
      data: data.delete_asset
    });
  }

  async getWorkspaceAssets({ workspaceId, limit = 25, page = 1 }) {
    if (!workspaceId) {
      throw new Error('workspaceId is required for getWorkspaceAssets action');
    }

    const data = await this.makeGraphQLRequest(assetQueries.GET_WORKSPACE_ASSETS, {
      workspaceId,
      limit,
      page
    });

    return JSON.stringify({
      success: true,
      action: 'getWorkspaceAssets',
      data: data.assets
    });
  }

  async createAssetPublicUrl({ assetId }) {
    if (!assetId) {
      throw new Error('assetId is required for createAssetPublicUrl action');
    }

    const data = await this.makeGraphQLRequest(assetQueries.CREATE_ASSET_PUBLIC_URL, {
      assetId
    });

    return JSON.stringify({
      success: true,
      action: 'createAssetPublicUrl',
      data: data.create_asset_public_url
    });
  }

  async searchAssets({ query, workspaceId, limit = 25 }) {
    if (!query) {
      throw new Error('query is required for searchAssets action');
    }

    const data = await this.makeGraphQLRequest(assetQueries.SEARCH_ASSETS, {
      query,
      workspaceId,
      limit
    });

    return JSON.stringify({
      success: true,
      action: 'searchAssets',
      data: data.assets
    });
  }

  async getAssetThumbnail({ assetId, width, height }) {
    if (!assetId) {
      throw new Error('assetId is required for getAssetThumbnail action');
    }

    const data = await this.makeGraphQLRequest(assetQueries.GET_ASSET_THUMBNAIL, {
      assetId,
      width,
      height
    });

    return JSON.stringify({
      success: true,
      action: 'getAssetThumbnail',
      data: data.assets[0] || null
    });
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

  async updateColumnAdvanced({ boardId, columnId, title, description }) {
    if (!boardId || !columnId) {
      throw new Error('boardId and columnId are required for updateColumnAdvanced action');
    }

    const data = await this.makeGraphQLRequest(advancedQueries.UPDATE_COLUMN, {
      boardId,
      columnId,
      title,
      description
    });

    return JSON.stringify({
      success: true,
      action: 'updateColumnAdvanced',
      data: data.change_column_title
    });
  }

  async deleteColumn({ boardId, columnId }) {
    if (!boardId || !columnId) {
      throw new Error('boardId and columnId are required for deleteColumn action');
    }

    const data = await this.makeGraphQLRequest(advancedQueries.DELETE_COLUMN, {
      boardId,
      columnId
    });

    return JSON.stringify({
      success: true,
      action: 'deleteColumn',
      data: data.delete_column
    });
  }

  async duplicateColumn({ boardId, columnId, title }) {
    if (!boardId || !columnId || !title) {
      throw new Error('boardId, columnId, and title are required for duplicateColumn action');
    }

    const data = await this.makeGraphQLRequest(advancedQueries.DUPLICATE_COLUMN, {
      boardId,
      columnId,
      title
    });

    return JSON.stringify({
      success: true,
      action: 'duplicateColumn',
      data: data.duplicate_column
    });
  }

  async moveColumn({ boardId, columnId, afterColumnId }) {
    if (!boardId || !columnId) {
      throw new Error('boardId and columnId are required for moveColumn action');
    }

    const data = await this.makeGraphQLRequest(advancedQueries.MOVE_COLUMN, {
      boardId,
      columnId,
      afterColumnId
    });

    return JSON.stringify({
      success: true,
      action: 'moveColumn',
      data: data.move_column_to
    });
  }

  async createGroupAdvanced({ boardId, groupName, color, position }) {
    if (!boardId || !groupName) {
      throw new Error('boardId and groupName are required for createGroupAdvanced action');
    }

    const data = await this.makeGraphQLRequest(advancedQueries.CREATE_GROUP_ADVANCED, {
      boardId,
      groupName,
      color,
      position
    });

    return JSON.stringify({
      success: true,
      action: 'createGroupAdvanced',
      data: data.create_group
    });
  }

  async updateGroup({ boardId, groupId, groupName, color }) {
    if (!boardId || !groupId) {
      throw new Error('boardId and groupId are required for updateGroup action');
    }

    const data = await this.makeGraphQLRequest(advancedQueries.UPDATE_GROUP, {
      boardId,
      groupId,
      groupName,
      color
    });

    return JSON.stringify({
      success: true,
      action: 'updateGroup',
      data: data.update_group
    });
  }

  async deleteGroup({ boardId, groupId }) {
    if (!boardId || !groupId) {
      throw new Error('boardId and groupId are required for deleteGroup action');
    }

    const data = await this.makeGraphQLRequest(advancedQueries.DELETE_GROUP, {
      boardId,
      groupId
    });

    return JSON.stringify({
      success: true,
      action: 'deleteGroup',
      data: data.delete_group
    });
  }

  async duplicateGroup({ boardId, groupId, groupName, addToTop = false }) {
    if (!boardId || !groupId) {
      throw new Error('boardId and groupId are required for duplicateGroup action');
    }

    const data = await this.makeGraphQLRequest(advancedQueries.DUPLICATE_GROUP, {
      boardId,
      groupId,
      groupName,
      addToTop
    });

    return JSON.stringify({
      success: true,
      action: 'duplicateGroup',
      data: data.duplicate_group
    });
  }

  async archiveGroup({ boardId, groupId }) {
    if (!boardId || !groupId) {
      throw new Error('boardId and groupId are required for archiveGroup action');
    }

    const data = await this.makeGraphQLRequest(advancedQueries.ARCHIVE_GROUP, {
      boardId,
      groupId
    });

    return JSON.stringify({
      success: true,
      action: 'archiveGroup',
      data: data.archive_group
    });
  }

  async moveGroup({ boardId, groupId, afterGroupId }) {
    if (!boardId || !groupId) {
      throw new Error('boardId and groupId are required for moveGroup action');
    }

    const data = await this.makeGraphQLRequest(advancedQueries.MOVE_GROUP, {
      boardId,
      groupId,
      afterGroupId
    });

    return JSON.stringify({
      success: true,
      action: 'moveGroup',
      data: data.move_group_to
    });
  }

  async moveItemToGroup({ itemId, groupId }) {
    if (!itemId || !groupId) {
      throw new Error('itemId and groupId are required for moveItemToGroup action');
    }

    const data = await this.makeGraphQLRequest(advancedQueries.MOVE_ITEM_TO_GROUP, {
      itemId,
      groupId
    });

    return JSON.stringify({
      success: true,
      action: 'moveItemToGroup',
      data: data.move_item_to_group
    });
  }

  async getGroupsExtended({ boardId }) {
    if (!boardId) {
      throw new Error('boardId is required for getGroupsExtended action');
    }

    const data = await this.makeGraphQLRequest(advancedQueries.GET_GROUPS_EXTENDED, {
      boardId: [boardId]
    });

    return JSON.stringify({
      success: true,
      action: 'getGroupsExtended',
      data: data.boards[0]?.groups || []
    });
  }

  async getColumnSettings({ boardId, columnId }) {
    if (!boardId || !columnId) {
      throw new Error('boardId and columnId are required for getColumnSettings action');
    }

    const data = await this.makeGraphQLRequest(advancedQueries.GET_COLUMN_SETTINGS, {
      boardId: [boardId],
      columnId
    });

    return JSON.stringify({
      success: true,
      action: 'getColumnSettings',
      data: data.boards[0]?.columns || []
    });
  }

  async changeColumnMetadata({ boardId, columnId, columnProperty, value }) {
    if (!boardId || !columnId || !columnProperty || !value) {
      throw new Error('boardId, columnId, columnProperty, and value are required for changeColumnMetadata action');
    }

    const data = await this.makeGraphQLRequest(advancedQueries.CHANGE_COLUMN_METADATA, {
      boardId,
      columnId,
      columnProperty,
      value
    });

    return JSON.stringify({
      success: true,
      action: 'changeColumnMetadata',
      data: data.change_column_metadata
    });
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
   * Форматирование ответа для агентов
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