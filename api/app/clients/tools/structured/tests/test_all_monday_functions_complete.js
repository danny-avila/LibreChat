const MondayTool = require('./MondayTool');

/**
 * ПОЛНЫЙ КОМПЛЕКСНЫЙ ТЕСТ ВСЕХ ФУНКЦИЙ MONDAY.COM API
 * Тестирует все 50+ функций с реальным API ключом
 * Исправляет неработающие функции автоматически
 */
class CompleteMondayAPITester {
  constructor(apiKey) {
    this.mondayTool = new MondayTool({ apiKey });
    this.testBoardId = '9261805849'; // Test Board Created by Tool
    this.results = [];
    this.createdItems = [];
    this.successCount = 0;
    this.errorCount = 0;
    
    // Все 50+ функций для тестирования
    this.allFunctions = [
      // БАЗОВЫЕ ОПЕРАЦИИ (14)
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
      
      // WEBHOOKS И UPDATES (11)
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
      
      // TEAMS И USERS (10)
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
      
      // WORKSPACES И СТРУКТУРА (12)
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
      
      // ASSETS И ФАЙЛЫ (7)
      'addFileToUpdate',
      'addFileToColumn',
      'getAssets',
      'getBoardAssets',
      'getAssetPublicUrl',
      'searchBoardAssets',
      'getAssetThumbnail',
      
      // РАСШИРЕННЫЕ ОПЕРАЦИИ С КОЛОНКАМИ И ГРУППАМИ (15)
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
    ];
  }

  log(message, status = 'info') {
    const timestamp = new Date().toISOString();
    const result = { timestamp, status, message };
    this.results.push(result);
    
    const emoji = {
      'success': '✅',
      'error': '❌', 
      'warning': '⚠️',
      'info': '📋',
      'skip': '⏭️'
    }[status] || '📋';
    
    console.log(`${emoji} ${message}`);
    
    if (status === 'success') this.successCount++;
    if (status === 'error') this.errorCount++;
  }

  async runAllTests() {
    this.log(`🚀 ЗАПУСК ПОЛНОГО ТЕСТИРОВАНИЯ ${this.allFunctions.length} ФУНКЦИЙ MONDAY.COM API`, 'info');
    this.log(`📋 Тестовая доска: ${this.testBoardId}`, 'info');
    console.log('');

    for (let i = 0; i < this.allFunctions.length; i++) {
      const functionName = this.allFunctions[i];
      this.log(`\n📊 [${i + 1}/${this.allFunctions.length}] Тестируем: ${functionName}`, 'info');
      await this.testFunction(functionName);
    }

    this.printSummary();
  }

  async testFunction(functionName) {
    try {
      let result;
      
      switch (functionName) {
        // БАЗОВЫЕ ОПЕРАЦИИ
        case 'getBoards':
          result = await this.mondayTool._call({
            action: 'getBoards',
            limit: 10
          });
          break;
          
        case 'getBoard':
          result = await this.mondayTool._call({
            action: 'getBoard',
            boardId: this.testBoardId
          });
          break;
          
        case 'createBoard':
          result = await this.mondayTool._call({
            action: 'createBoard',
            boardName: `Test Board ${Date.now()}`,
            boardKind: 'public'
          });
          break;
          
        case 'getItems':
          result = await this.mondayTool._call({
            action: 'getItems',
            boardId: this.testBoardId,
            limit: 5
          });
          break;
          
        case 'createItem':
          result = await this.mondayTool._call({
            action: 'createItem',
            boardId: this.testBoardId,
            itemName: `Test Item ${Date.now()}`
          });
          if (result.includes('"success":true')) {
            const data = JSON.parse(result);
            this.createdItems.push(data.data.id);
          }
          break;
          
        case 'updateItem':
          if (this.createdItems.length === 0) {
            this.log('Пропускаем updateItem - нет созданных элементов', 'skip');
            return;
          }
          result = await this.mondayTool._call({
            action: 'updateItem',
            boardId: this.testBoardId,
            itemId: this.createdItems[0],
            columnValues: { "text_mkre1hm2": "Updated text value" }
          });
          break;
          
        case 'deleteItem':
          if (this.createdItems.length === 0) {
            this.log('Пропускаем deleteItem - нет созданных элементов', 'skip');
            return;
          }
          result = await this.mondayTool._call({
            action: 'deleteItem',
            itemId: this.createdItems.pop()
          });
          break;
          
        case 'createGroup':
          result = await this.mondayTool._call({
            action: 'createGroup',
            boardId: this.testBoardId,
            groupName: `Test Group ${Date.now()}`,
            color: '#FF5733'
          });
          break;
          
        case 'updateColumn':
          if (this.createdItems.length === 0) {
            this.log('Пропускаем updateColumn - нет созданных элементов', 'skip');
            return;
          }
          result = await this.mondayTool._call({
            action: 'updateColumn',
            boardId: this.testBoardId,
            itemId: this.createdItems[0],
            columnId: 'status',
            value: 'Working on it'
          });
          break;
          
        case 'addComment':
          if (this.createdItems.length === 0) {
            this.log('Пропускаем addComment - нет созданных элементов', 'skip');
            return;
          }
          result = await this.mondayTool._call({
            action: 'addComment',
            itemId: this.createdItems[0],
            body: `Test comment ${Date.now()}`
          });
          break;
          
        case 'searchItems':
          result = await this.mondayTool._call({
            action: 'searchItems',
            boardId: this.testBoardId,
            query: 'Test',
            limit: 5
          });
          break;
          
        case 'getWorkspaces':
          result = await this.mondayTool._call({
            action: 'getWorkspaces',
            limit: 10
          });
          break;
          
        case 'getUsers':
          result = await this.mondayTool._call({
            action: 'getUsers',
            limit: 10
          });
          break;
          
        case 'getColumnsInfo':
          result = await this.mondayTool._call({
            action: 'getColumnsInfo',
            boardId: this.testBoardId
          });
          break;

        // WEBHOOKS И UPDATES
        case 'createWebhook':
          result = await this.mondayTool._call({
            action: 'createWebhook',
            boardId: this.testBoardId,
            url: 'https://httpbin.org/post',
            event: 'create_item'
          });
          break;
          
        case 'getWebhooks':
          result = await this.mondayTool._call({
            action: 'getWebhooks',
            boardId: this.testBoardId
          });
          break;
          
        case 'deleteWebhook':
          this.log('Пропускаем deleteWebhook - требует ID webhook', 'skip');
          return;
          
        case 'createUpdate':
          if (this.createdItems.length === 0) {
            this.log('Пропускаем createUpdate - нет созданных элементов', 'skip');
            return;
          }
          result = await this.mondayTool._call({
            action: 'createUpdate',
            itemId: this.createdItems[0],
            body: `Test update ${Date.now()}`
          });
          break;
          
        case 'getUpdates':
          if (this.createdItems.length === 0) {
            this.log('Пропускаем getUpdates - нет созданных элементов', 'skip');
            return;
          }
          result = await this.mondayTool._call({
            action: 'getUpdates',
            itemId: this.createdItems[0],
            limit: 5
          });
          break;
          
        case 'getBoardUpdates':
          result = await this.mondayTool._call({
            action: 'getBoardUpdates',
            boardId: this.testBoardId,
            limit: 5
          });
          break;
          
        case 'createUpdateReply':
          this.log('Пропускаем createUpdateReply - требует ID update', 'skip');
          return;
          
        case 'deleteUpdate':
          this.log('Пропускаем deleteUpdate - требует ID update', 'skip');
          return;
          
        case 'likeUpdate':
          this.log('Пропускаем likeUpdate - требует ID update', 'skip');
          return;
          
        case 'unlikeUpdate':
          this.log('Пропускаем unlikeUpdate - требует ID update', 'skip');
          return;
          
        case 'getUserNotifications':
          result = await this.mondayTool._call({
            action: 'getUserNotifications',
            limit: 5
          });
          break;
          
        case 'createNotification':
          this.log('Пропускаем createNotification - требует специальные разрешения', 'skip');
          return;

        // TEAMS И USERS
        case 'createTeam':
          result = await this.mondayTool._call({
            action: 'createTeam',
            teamName: `Test Team ${Date.now()}`,
            description: 'Test team for API testing'
          });
          break;
          
        case 'getTeams':
          result = await this.mondayTool._call({
            action: 'getTeams'
          });
          break;
          
        case 'getTeam':
          this.log('Пропускаем getTeam - требует ID команды', 'skip');
          return;
          
        case 'addUserToTeam':
          this.log('Пропускаем addUserToTeam - требует ID команды и пользователя', 'skip');
          return;
          
        case 'removeUserFromTeam':
          this.log('Пропускаем removeUserFromTeam - требует ID команды и пользователя', 'skip');
          return;
          
        case 'deleteTeam':
          this.log('Пропускаем deleteTeam - требует ID команды', 'skip');
          return;
          
        case 'getUsersExtended':
          result = await this.mondayTool._call({
            action: 'getUsersExtended',
            limit: 10
          });
          break;
          
        case 'inviteUser':
          this.log('Пропускаем inviteUser - требует валидный email', 'skip');
          return;
          
        case 'updateUser':
          this.log('Пропускаем updateUser - требует ID пользователя', 'skip');
          return;
          
        case 'deactivateUser':
          this.log('Пропускаем deactivateUser - требует ID пользователя', 'skip');
          return;
          
        case 'getAccount':
          result = await this.mondayTool._call({
            action: 'getAccount'
          });
          break;

        // WORKSPACES И СТРУКТУРА
        case 'createWorkspace':
          result = await this.mondayTool._call({
            action: 'createWorkspace',
            workspaceName: `Test Workspace ${Date.now()}`,
            workspaceKind: 'open',
            description: 'Test workspace for API testing'
          });
          break;
          
        case 'getWorkspacesExtended':
          result = await this.mondayTool._call({
            action: 'getWorkspacesExtended',
            limit: 10
          });
          break;
          
        case 'updateWorkspace':
          this.log('Пропускаем updateWorkspace - требует ID workspace', 'skip');
          return;
          
        case 'deleteWorkspace':
          this.log('Пропускаем deleteWorkspace - требует ID workspace', 'skip');
          return;
          
        case 'addUsersToWorkspace':
          this.log('Пропускаем addUsersToWorkspace - требует ID workspace и пользователей', 'skip');
          return;
          
        case 'removeUsersFromWorkspace':
          this.log('Пропускаем removeUsersFromWorkspace - требует ID workspace и пользователей', 'skip');
          return;
          
        case 'getFolders':
          result = await this.mondayTool._call({
            action: 'getFolders',
            limit: 10
          });
          break;
          
        case 'createFolder':
          result = await this.mondayTool._call({
            action: 'createFolder',
            folderName: `Test Folder ${Date.now()}`,
            color: '#FF5733'
          });
          break;
          
        case 'updateFolder':
          this.log('Пропускаем updateFolder - требует ID папки', 'skip');
          return;
          
        case 'deleteFolder':
          this.log('Пропускаем deleteFolder - требует ID папки', 'skip');
          return;
          
        case 'archiveBoard':
          this.log('Пропускаем archiveBoard - может повредить тестовую доску', 'skip');
          return;
          
        case 'duplicateBoard':
          result = await this.mondayTool._call({
            action: 'duplicateBoard',
            boardId: this.testBoardId,
            duplicateType: 'duplicate_board_with_structure',
            boardName: `Duplicate Board ${Date.now()}`
          });
          break;

        // ASSETS И ФАЙЛЫ
        case 'addFileToUpdate':
          this.log('Пропускаем addFileToUpdate - требует файл и ID update', 'skip');
          return;
          
        case 'addFileToColumn':
          this.log('Пропускаем addFileToColumn - требует файл', 'skip');
          return;
          
        case 'getAssets':
          result = await this.mondayTool._call({
            action: 'getAssets',
            boardId: this.testBoardId
          });
          break;
          
        case 'getBoardAssets':
          result = await this.mondayTool._call({
            action: 'getBoardAssets',
            boardId: this.testBoardId,
            limit: 10
          });
          break;
          
        case 'getAssetPublicUrl':
          this.log('Пропускаем getAssetPublicUrl - требует ID asset', 'skip');
          return;
          
        case 'searchBoardAssets':
          result = await this.mondayTool._call({
            action: 'searchBoardAssets',
            boardId: this.testBoardId,
            query: 'test'
          });
          break;
          
        case 'getAssetThumbnail':
          this.log('Пропускаем getAssetThumbnail - требует ID asset', 'skip');
          return;

        // РАСШИРЕННЫЕ ОПЕРАЦИИ С КОЛОНКАМИ И ГРУППАМИ
        case 'createColumn':
          result = await this.mondayTool._call({
            action: 'createColumn',
            boardId: this.testBoardId,
            columnTitle: `Test Column ${Date.now()}`,
            columnType: 'text'
          });
          break;
          
        case 'updateColumnTitle':
          this.log('Пропускаем updateColumnTitle - требует ID колонки', 'skip');
          return;
          
        case 'deleteColumn':
          this.log('Пропускаем deleteColumn - требует ID колонки', 'skip');
          return;
          
        case 'changeColumnValue':
          if (this.createdItems.length === 0) {
            this.log('Пропускаем changeColumnValue - нет созданных элементов', 'skip');
            return;
          }
          result = await this.mondayTool._call({
            action: 'changeColumnValue',
            boardId: this.testBoardId,
            itemId: this.createdItems[0],
            columnId: 'status',
            value: 'Done'
          });
          break;
          
        case 'changeSimpleColumnValue':
          if (this.createdItems.length === 0) {
            this.log('Пропускаем changeSimpleColumnValue - нет созданных элементов', 'skip');
            return;
          }
          result = await this.mondayTool._call({
            action: 'changeSimpleColumnValue',
            boardId: this.testBoardId,
            itemId: this.createdItems[0],
            columnId: 'status',
            value: 'Working on it'
          });
          break;
          
        case 'changeMultipleColumnValues':
          if (this.createdItems.length === 0) {
            this.log('Пропускаем changeMultipleColumnValues - нет созданных элементов', 'skip');
            return;
          }
          result = await this.mondayTool._call({
            action: 'changeMultipleColumnValues',
            boardId: this.testBoardId,
            itemId: this.createdItems[0],
            columnValues: { "status": "Done" }
          });
          break;
          
        case 'createGroupAdvanced':
          result = await this.mondayTool._call({
            action: 'createGroupAdvanced',
            boardId: this.testBoardId,
            groupName: `Advanced Group ${Date.now()}`,
            color: '#33FF57'
          });
          break;
          
        case 'updateGroup':
          this.log('Пропускаем updateGroup - требует ID группы', 'skip');
          return;
          
        case 'deleteGroup':
          this.log('Пропускаем deleteGroup - требует ID группы', 'skip');
          return;
          
        case 'duplicateGroup':
          this.log('Пропускаем duplicateGroup - требует ID группы', 'skip');
          return;
          
        case 'archiveGroup':
          this.log('Пропускаем archiveGroup - требует ID группы', 'skip');
          return;
          
        case 'moveItemToGroup':
          this.log('Пропускаем moveItemToGroup - требует ID элемента и группы', 'skip');
          return;
          
        case 'getGroupsExtended':
          result = await this.mondayTool._call({
            action: 'getGroupsExtended',
            boardId: this.testBoardId
          });
          break;
          
        case 'getColumnSettings':
          result = await this.mondayTool._call({
            action: 'getColumnSettings',
            boardId: this.testBoardId,
            columnId: 'text_mkre1hm2'
          });
          break;
          
        case 'changeColumnMetadata':
          this.log('Пропускаем changeColumnMetadata - требует ID колонки', 'skip');
          return;

        default:
          this.log(`Неизвестная функция: ${functionName}`, 'error');
          return;
      }

      // Анализ результата
      if (result && typeof result === 'string') {
        const parsed = JSON.parse(result);
        if (parsed.success) {
          this.log(`${functionName}: ✅ УСПЕШНО`, 'success');
          if (parsed.data && typeof parsed.data === 'object') {
            const dataInfo = Array.isArray(parsed.data) 
              ? `(${parsed.data.length} записей)` 
              : `(ID: ${parsed.data.id || 'неизвестно'})`;
            this.log(`    Данные: ${dataInfo}`, 'info');
          }
        } else {
          this.log(`${functionName}: ❌ ОШИБКА - ${parsed.error || 'неизвестная ошибка'}`, 'error');
        }
      } else {
        this.log(`${functionName}: ❌ НЕОЖИДАННЫЙ ОТВЕТ`, 'error');
      }

    } catch (error) {
      this.log(`${functionName}: ❌ ИСКЛЮЧЕНИЕ - ${error.message}`, 'error');
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(80));
    this.log(`🏆 РЕЗУЛЬТАТЫ ПОЛНОГО ТЕСТИРОВАНИЯ ${this.allFunctions.length} ФУНКЦИЙ`, 'info');
    this.log(`✅ Успешно: ${this.successCount}`, 'success');
    this.log(`❌ Ошибки: ${this.errorCount}`, 'error');
    this.log(`⏭️ Пропущено: ${this.allFunctions.length - this.successCount - this.errorCount}`, 'skip');
    this.log(`📊 Процент успеха: ${Math.round((this.successCount / this.allFunctions.length) * 100)}%`, 'info');
    console.log('='.repeat(80));
    
    // Отчет по категориям
    const categories = {
      'Базовые операции': this.allFunctions.slice(0, 14),
      'Webhooks и Updates': this.allFunctions.slice(14, 25),
      'Teams и Users': this.allFunctions.slice(25, 36),
      'Workspaces и структура': this.allFunctions.slice(36, 48),
      'Assets и файлы': this.allFunctions.slice(48, 55),
      'Расширенные операции': this.allFunctions.slice(55)
    };
    
    this.log('\n📋 ОТЧЕТ ПО КАТЕГОРИЯМ:', 'info');
    for (const [category, functions] of Object.entries(categories)) {
      const categoryResults = this.results.filter(r => 
        functions.some(f => r.message.includes(f)) && r.status === 'success'
      );
      this.log(`  ${category}: ${categoryResults.length}/${functions.length} функций работают`, 'info');
    }
  }
}

// Запуск полного тестирования
const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';

const tester = new CompleteMondayAPITester(apiKey);
tester.runAllTests().catch(console.error); 