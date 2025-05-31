const MondayTool = require('./MondayTool');

/**
 * БЫСТРЫЙ ТЕСТ СТАТУСА MONDAY.COM API
 * Проверяет ключевые функции для оценки состояния проекта
 */

const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';

const testBoard = '9261805849';

async function quickTest() {
  const mondayTool = new MondayTool({ apiKey });
  
  console.log('🔍 БЫСТРАЯ ПРОВЕРКА СТАТУСА MONDAY.COM API ПРОЕКТА');
  console.log('================================================');
  
  const keyFunctions = [
    'getBoards',
    'getBoard', 
    'createBoard',
    'getItems',
    'createItem',
    'updateItem',
    'deleteItem',
    'createGroup',
    'updateColumn',
    'searchItems',
    'getWorkspaces',
    'getUsers',
    'createWebhook',
    'getBoardUpdates',
    'duplicateBoard'
  ];
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const func of keyFunctions) {
    try {
      let result;
      
      switch (func) {
        case 'getBoards':
          result = await mondayTool._call({ action: 'getBoards', limit: 5 });
          break;
        case 'getBoard':
          result = await mondayTool._call({ action: 'getBoard', boardId: testBoard });
          break;
        case 'createBoard':
          result = await mondayTool._call({ action: 'createBoard', boardName: `Quick Test ${Date.now()}` });
          break;
        case 'getItems':
          result = await mondayTool._call({ action: 'getItems', boardId: testBoard });
          break;
        case 'createItem':
          result = await mondayTool._call({ action: 'createItem', boardId: testBoard, itemName: `Test Item ${Date.now()}` });
          break;
        case 'updateItem':
          result = await mondayTool._call({ action: 'updateItem', boardId: testBoard, itemId: 'mock_item', columnValues: {} });
          break;
        case 'deleteItem':
          result = await mondayTool._call({ action: 'deleteItem', itemId: 'mock_item' });
          break;
        case 'createGroup':
          result = await mondayTool._call({ action: 'createGroup', boardId: testBoard, groupName: `Test Group ${Date.now()}` });
          break;
        case 'updateColumn':
          result = await mondayTool._call({ action: 'updateColumn', boardId: testBoard, itemId: 'mock_item', columnId: 'status', value: 'Test' });
          break;
        case 'searchItems':
          result = await mondayTool._call({ action: 'searchItems', boardId: testBoard, query: 'Test' });
          break;
        case 'getWorkspaces':
          result = await mondayTool._call({ action: 'getWorkspaces' });
          break;
        case 'getUsers':
          result = await mondayTool._call({ action: 'getUsers' });
          break;
        case 'createWebhook':
          result = await mondayTool._call({ action: 'createWebhook', boardId: testBoard, url: 'https://test.com', event: 'create_item' });
          break;
        case 'getBoardUpdates':
          result = await mondayTool._call({ action: 'getBoardUpdates', boardId: testBoard });
          break;
        case 'duplicateBoard':
          result = await mondayTool._call({ action: 'duplicateBoard', boardId: testBoard, duplicateType: 'duplicate_structure_and_items' });
          break;
        default:
          continue;
      }
      
      if (result && result.includes('"success":true')) {
        console.log(`✅ ${func}: РАБОТАЕТ`);
        successCount++;
      } else {
        console.log(`❌ ${func}: ОШИБКА`);
        errorCount++;
      }
      
    } catch (error) {
      console.log(`❌ ${func}: ИСКЛЮЧЕНИЕ - ${error.message.substring(0, 100)}...`);
      errorCount++;
    }
  }
  
  console.log('\n================================================');
  console.log(`📊 РЕЗУЛЬТАТЫ:`);
  console.log(`✅ Работает: ${successCount}/${keyFunctions.length} (${Math.round(successCount/keyFunctions.length*100)}%)`);
  console.log(`❌ Ошибки: ${errorCount}/${keyFunctions.length}`);
  console.log('================================================');
  
  if (successCount < 8) {
    console.log('⚠️  КРИТИЧЕСКАЯ СИТУАЦИЯ: Восстановление файла прошло неудачно');
    console.log('📋 НЕОБХОДИМО: Восстановить рабочую версию из бэкапа');
  } else {
    console.log('✅ СОСТОЯНИЕ: Основные функции работают');
    console.log('📋 МОЖНО: Продолжать улучшения');
  }
}

quickTest().catch(console.error); 