const MondayTool = require('./MondayTool');

/**
 * ТЕСТ КРИТИЧЕСКИХ ИСПРАВЛЕНИЙ MONDAY.COM API
 * Тестируем основные проблемные функции после исправлений
 */
async function testCriticalFixes() {
  const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';
  const mondayTool = new MondayTool({ apiKey });
  const testBoardId = '9261805849';

  console.log('🔧 Тестируем КРИТИЧЕСКИЕ исправления...\n');

  const problematicFunctions = [
    'createBoard',
    'getItems', 
    'updateItem',
    'deleteItem',
    'createGroup',
    'searchItems',
    'getWorkspaces',
    'createWebhook',
    'updateColumn',
    'searchBoardAssets',
    'createFolder',
    'duplicateBoard',
    'createGroupAdvanced'
  ];

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < problematicFunctions.length; i++) {
    const functionName = problematicFunctions[i];
    console.log(`${i + 1}. Тестируем: ${functionName}`);
    
    try {
      let result;
      
      switch (functionName) {
        case 'createBoard':
          result = await mondayTool._call({
            action: 'createBoard',
            boardName: `Fix Test Board ${Date.now()}`,
            boardKind: 'public'
          });
          break;
          
        case 'getItems':
          result = await mondayTool._call({
            action: 'getItems',
            boardId: testBoardId,
            limit: 5
          });
          break;
          
        case 'updateItem':
          // Сначала создаем элемент
          const createResult = await mondayTool._call({
            action: 'createItem',
            boardId: testBoardId,
            itemName: `Update Test Item ${Date.now()}`
          });
          const parsedCreate = JSON.parse(createResult);
          if (parsedCreate.success && parsedCreate.data?.id) {
            result = await mondayTool._call({
              action: 'updateItem',
              boardId: testBoardId,
              itemId: parsedCreate.data.id,
              columnValues: { "text_mkre1hm2": "Updated text value" }
            });
          } else {
            throw new Error('Failed to create item for update test');
          }
          break;
          
        case 'deleteItem':
          // Сначала создаем элемент для удаления
          const createForDelete = await mondayTool._call({
            action: 'createItem',
            boardId: testBoardId,
            itemName: `Delete Test Item ${Date.now()}`
          });
          const parsedDelete = JSON.parse(createForDelete);
          if (parsedDelete.success && parsedDelete.data?.id) {
            result = await mondayTool._call({
              action: 'deleteItem',
              itemId: parsedDelete.data.id
            });
          } else {
            throw new Error('Failed to create item for delete test');
          }
          break;
          
        case 'createGroup':
          result = await mondayTool._call({
            action: 'createGroup',
            boardId: testBoardId,
            groupName: `Fix Test Group ${Date.now()}`,
            color: '#FF5733'
          });
          break;
          
        case 'searchItems':
          result = await mondayTool._call({
            action: 'searchItems',
            boardId: testBoardId,
            query: 'Test',
            limit: 5
          });
          break;
          
        case 'getWorkspaces':
          result = await mondayTool._call({
            action: 'getWorkspaces',
            limit: 10
          });
          break;
          
        case 'createWebhook':
          result = await mondayTool._call({
            action: 'createWebhook',
            boardId: testBoardId,
            url: 'https://httpbin.org/post',
            event: 'create_item'
          });
          break;
          
        case 'updateColumn':
          // Создаем элемент для обновления колонки
          const createForColumn = await mondayTool._call({
            action: 'createItem',
            boardId: testBoardId,
            itemName: `Column Test Item ${Date.now()}`
          });
          const parsedColumn = JSON.parse(createForColumn);
          if (parsedColumn.success && parsedColumn.data?.id) {
            result = await mondayTool._call({
              action: 'updateColumn',
              boardId: testBoardId,
              itemId: parsedColumn.data.id,
              columnId: 'text_mkre1hm2',
              value: 'Test column update value'
            });
          } else {
            throw new Error('Failed to create item for column test');
          }
          break;
          
        case 'searchBoardAssets':
          result = await mondayTool._call({
            action: 'searchBoardAssets',
            boardId: testBoardId,
            query: 'test'
          });
          break;
          
        case 'createFolder':
          result = await mondayTool._call({
            action: 'createFolder',
            folderName: `Fix Test Folder ${Date.now()}`,
            color: '#33FF57'
          });
          break;
          
        case 'duplicateBoard':
          result = await mondayTool._call({
            action: 'duplicateBoard',
            boardId: testBoardId,
            duplicateType: 'duplicate_board_with_structure',
            boardName: `Fix Duplicate Board ${Date.now()}`
          });
          break;
          
        case 'createGroupAdvanced':
          result = await mondayTool._call({
            action: 'createGroupAdvanced',
            boardId: testBoardId,
            groupName: `Fix Advanced Group ${Date.now()}`,
            color: '#57FF33'
          });
          break;
          
        default:
          throw new Error(`Unknown function: ${functionName}`);
      }

      // Проверяем результат
      if (result && typeof result === 'string') {
        const parsed = JSON.parse(result);
        if (parsed.success) {
          console.log(`   ✅ ИСПРАВЛЕНО: ${functionName}`);
          successCount++;
        } else {
          console.log(`   ❌ ВСЕ ЕЩЕ ОШИБКА: ${functionName} - ${parsed.error}`);
          errorCount++;
        }
      } else {
        console.log(`   ❌ НЕОЖИДАННЫЙ ОТВЕТ: ${functionName}`);
        errorCount++;
      }

    } catch (error) {
      console.log(`   ❌ ИСКЛЮЧЕНИЕ: ${functionName} - ${error.message}`);
      errorCount++;
    }

    // Небольшая пауза между тестами
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '='.repeat(60));
  console.log(`🏆 РЕЗУЛЬТАТЫ ИСПРАВЛЕНИЙ:`);
  console.log(`✅ Исправлено: ${successCount}/${problematicFunctions.length}`);
  console.log(`❌ Все еще ошибки: ${errorCount}/${problematicFunctions.length}`);
  console.log(`📊 Процент исправлений: ${Math.round((successCount / problematicFunctions.length) * 100)}%`);
  console.log('='.repeat(60));
}

testCriticalFixes().catch(console.error); 