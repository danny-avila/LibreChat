const MondayTool = require('./../../api/app/clients/tools/structured/MondayTool');

/**
 * ПРОСТОЕ ТЕСТИРОВАНИЕ РАБОЧИХ ФУНКЦИЙ
 */
async function testWorkingFunctions() {
  const apiKey = process.env.MONDAY_API_KEY;
  
  if (!apiKey) {
    console.error('❌ MONDAY_API_KEY не установлен!');
    process.exit(1);
  }

  const mondayTool = new MondayTool({ apiKey });
  const testBoardId = '9261805849';

  console.log('🧪 ТЕСТИРОВАНИЕ ПРОСТЫХ РАБОЧИХ ФУНКЦИЙ');
  console.log('=' .repeat(50));

  try {
    // 1. Тест getBoards - проверенная рабочая функция
    console.log('\n📋 1. Тестируем getBoards...');
    const boardsResult = await mondayTool.getBoards({ limit: 3 });
    const boards = JSON.parse(boardsResult);
    console.log('✅ getBoards работает!');
    console.log(`   📊 Найдено досок: ${boards.data.length}`);

    // 2. Тест getBoard - получение информации о конкретной доске
    console.log('\n📋 2. Тестируем getBoard...');
    const boardResult = await mondayTool.getBoard({ 
      boardId: testBoardId,
      includeItems: false,
      includeGroups: true,
      includeColumns: true
    });
    const board = JSON.parse(boardResult);
    console.log('✅ getBoard работает!');
    console.log(`   📊 Доска: ${board.data.name}`);

    // 3. Тест createItem - создание нового элемента
    console.log('\n➕ 3. Тестируем createItem...');
    const itemResult = await mondayTool.createItem({
      boardId: testBoardId,
      itemName: `Test Item ${Date.now()}`
    });
    const item = JSON.parse(itemResult);
    console.log('✅ createItem работает!');
    console.log(`   📊 Создан элемент: ${item.data.name} (ID: ${item.data.id})`);

    // 4. Тест getColumnsInfo - получение информации о колонках
    console.log('\n📋 4. Тестируем getColumnsInfo...');
    const columnsResult = await mondayTool.getColumnsInfo({ boardId: testBoardId });
    const columns = JSON.parse(columnsResult);
    console.log('✅ getColumnsInfo работает!');
    console.log(`   📊 Найдено колонок: ${columns.data.length}`);

    // 5. Тест getWorkspaces
    console.log('\n🏢 5. Тестируем getWorkspaces...');
    const workspacesResult = await mondayTool.getWorkspaces({ limit: 3 });
    const workspaces = JSON.parse(workspacesResult);
    console.log('✅ getWorkspaces работает!');
    console.log(`   📊 Найдено workspaces: ${workspaces.data.length}`);

    console.log('\n');
    console.log('=' .repeat(50));
    console.log('🎉 ВСЕ БАЗОВЫЕ ФУНКЦИИ РАБОТАЮТ КОРРЕКТНО!');
    console.log('=' .repeat(50));

    // Теперь тестируем проблемные функции с простыми запросами
    console.log('\n🔧 ТЕСТИРОВАНИЕ УПРОЩЕННЫХ ПРОБЛЕМНЫХ ФУНКЦИЙ:');
    console.log('-' .repeat(50));

    // Тест простого getItems
    console.log('\n📝 Тестируем простой getItems...');
    try {
      const simpleQuery = `
        query {
          boards(ids: [${testBoardId}]) {
            id
            name
            items_page(limit: 3) {
              items {
                id
                name
              }
            }
          }
        }
      `;
      
      const result = await mondayTool.makeGraphQLRequest(simpleQuery, {});
      console.log('✅ Простой getItems работает!');
      console.log(`   📊 Элементов: ${result.boards[0].items_page.items.length}`);
    } catch (error) {
      console.log('❌ getItems все еще не работает:', error.message);
    }

  } catch (error) {
    console.error('❌ Ошибка в тестировании:', error.message);
  }
}

testWorkingFunctions(); 