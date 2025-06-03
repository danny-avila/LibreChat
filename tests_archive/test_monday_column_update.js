/**
 * Тест функции updateColumn в Monday.com Tool согласно официальной документации API
 * Использование: MONDAY_API_KEY=ваш_токен node test_monday_column_update.js
 * 
 * Основные мутации Monday.com для обновления колонок:
 * - change_column_value (JSON формат)
 * - change_simple_column_value (простые строки)
 * - change_multiple_column_values (несколько колонок)
 */

const { MondayTool } = require('./api/app/clients/tools/structured/MondayTool');

async function testColumnUpdate() {
  console.log('🚀 Тестирование Monday.com Column Update...\n');

  // Получаем API ключ из переменной окружения
  const apiKey = process.env.MONDAY_API_KEY;
  
  if (!apiKey) {
    console.error('❌ Установите переменную окружения MONDAY_API_KEY');
    console.log('Пример: MONDAY_API_KEY=your_token node test_monday_column_update.js');
    process.exit(1);
  }

  // Создаем экземпляр MondayTool
  const mondayTool = new MondayTool({
    MONDAY_API_KEY: apiKey
  });

  try {
    console.log('📋 Шаг 1: Получение списка досок...');
    const boardsResult = await mondayTool._call({
      action: 'getBoards',
      limit: 5
    });
    
    const boards = JSON.parse(boardsResult).data;
    console.log(`✅ Найдено досок: ${boards.length}`);
    
    if (boards.length === 0) {
      console.log('❌ Нет доступных досок для тестирования');
      return;
    }

    // Выберем первую доску
    const testBoard = boards[0];
    console.log(`🎯 Используем доску: "${testBoard.name}" (ID: ${testBoard.id})`);

    console.log('\n📋 Шаг 2: Получение элементов доски...');
    const itemsResult = await mondayTool._call({
      action: 'getItems',
      boardId: testBoard.id,
      limit: 3
    });
    
    const itemsData = JSON.parse(itemsResult);
    const items = itemsData.data?.items || [];
    console.log(`✅ Найдено элементов: ${items.length}`);
    
    if (items.length === 0) {
      console.log('⚠️ Нет элементов в доске, создаем тестовый элемент...');
      
      const createResult = await mondayTool._call({
        action: 'createItem',
        boardId: testBoard.id,
        itemName: 'Test Item for Column Update'
      });
      
      const createdItem = JSON.parse(createResult);
      console.log(`✅ Создан элемент: ${createdItem.data.name} (ID: ${createdItem.data.id})`);
      items.push(createdItem.data);
    }

    const testItem = items[0];
    console.log(`🎯 Используем элемент: "${testItem.name}" (ID: ${testItem.id})`);

    console.log('\n📋 Шаг 3: Получение информации о колонках...');
    const columnsResult = await mondayTool._call({
      action: 'getColumnsInfo',
      boardId: testBoard.id
    });
    
    const columnsData = JSON.parse(columnsResult);
    const columns = columnsData.data?.columns || [];
    console.log(`✅ Найдено колонок: ${columns.length}`);
    
    // Найдем текстовую колонку или колонку status для тестирования
    const textColumn = columns.find(col => col.type === 'text');
    const statusColumn = columns.find(col => col.type === 'color' || col.type === 'status');
    const testColumn = textColumn || statusColumn;

    if (!testColumn) {
      console.log('❌ Не найдено подходящих колонок для тестирования');
      return;
    }

    console.log(`🎯 Используем колонку: "${testColumn.title}" (ID: ${testColumn.id}, Type: ${testColumn.type})`);

    console.log('\n📋 Шаг 4: Тестирование updateColumn...');
    
    // Определяем значение в зависимости от типа колонки согласно документации Monday.com
    let testValue;
    switch(testColumn.type) {
      case 'text':
        testValue = 'Обновлено через API тест';
        break;
      case 'status':
      case 'color':
        // Для статус колонок используем index согласно документации
        testValue = { index: 1 };
        break;
      case 'checkbox':
        testValue = { checked: 'true' };
        break;
      case 'date':
        testValue = { date: new Date().toISOString().split('T')[0] };
        break;
      case 'numbers':
        testValue = '42';
        break;
      case 'people':
        testValue = { personsAndTeams: [] };
        break;
      default:
        testValue = 'Test Value';
    }

    console.log(`🔧 Обновляем колонку "${testColumn.title}" значением:`, testValue);

    const updateResult = await mondayTool._call({
      action: 'updateColumn',
      boardId: testBoard.id,
      itemId: testItem.id,
      columnId: testColumn.id,
      value: testValue,
      createLabelsIfMissing: true
    });

    const updateData = JSON.parse(updateResult);
    console.log('✅ Результат обновления колонки:', JSON.stringify(updateData, null, 2));

    console.log('\n📋 Шаг 5: Проверка результата...');
    
    // Получаем обновленный элемент
    const verifyResult = await mondayTool._call({
      action: 'getItems',
      boardId: testBoard.id,
      itemIds: [testItem.id]
    });
    
    const verifyData = JSON.parse(verifyResult);
    const updatedItem = verifyData.data?.items?.[0];
    
    if (updatedItem) {
      console.log('✅ Обновленный элемент получен');
      const updatedColumn = updatedItem.column_values?.find(col => col.id === testColumn.id);
      if (updatedColumn) {
        console.log(`✅ Значение колонки "${testColumn.title}":`, updatedColumn.text || updatedColumn.value);
      }
    }

    console.log('\n🎉 Тест завершен успешно!');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error);
    
    // Выводим детальную информацию об ошибке
    if (error.response) {
      console.error('📋 Response data:', error.response.data);
      console.error('📋 Response status:', error.response.status);
    }
    
    if (error.message.includes('GraphQL')) {
      console.error('📋 Это GraphQL ошибка. Проверьте:');
      console.error('   - Правильность API ключа');
      console.error('   - Доступность API Monday.com');
      console.error('   - Корректность параметров запроса');
    }
  }
}

// Дополнительный тест: проверка различных типов колонок
async function testDifferentColumnTypes() {
  console.log('\n🔬 Расширенный тест различных типов колонок...');
  
  const apiKey = process.env.MONDAY_API_KEY;
  const mondayTool = new MondayTool({ MONDAY_API_KEY: apiKey });

  try {
    // Получаем первую доску
    const boardsResult = await mondayTool._call({ action: 'getBoards', limit: 1 });
    const boards = JSON.parse(boardsResult).data;
    
    if (boards.length === 0) {
      console.log('❌ Нет досок для расширенного тестирования');
      return;
    }

    const boardId = boards[0].id;
    
    // Получаем колонки
    const columnsResult = await mondayTool._call({
      action: 'getColumnsInfo',
      boardId: boardId
    });
    
    const columns = JSON.parse(columnsResult).data?.columns || [];
    
    // Получаем элементы
    const itemsResult = await mondayTool._call({
      action: 'getItems',
      boardId: boardId,
      limit: 1
    });
    
    const items = JSON.parse(itemsResult).data?.items || [];
    
    if (items.length === 0) {
      console.log('❌ Нет элементов для расширенного тестирования');
      return;
    }

    const itemId = items[0].id;

    console.log(`\n📊 Тестирование различных типов колонок на элементе ${itemId}:`);

    // Тестируем различные типы колонок согласно официальной документации
    const testCases = [
      {
        type: 'text',
        value: 'Updated via API test',
        description: 'Текстовая колонка'
      },
      {
        type: 'numbers', 
        value: '42',
        description: 'Числовая колонка'
      },
      {
        type: 'status',
        value: { index: 1 }, // Используем index согласно документации
        description: 'Статус колонка'
      },
      {
        type: 'date',
        value: { date: '2025-05-31' },
        description: 'Дата колонка'  
      },
      {
        type: 'people',
        value: { personsAndTeams: [] },
        description: 'Персона колонка'
      },
      {
        type: 'checkbox',
        value: { checked: 'true' },
        description: 'Чекбокс колонка'
      },
      {
        type: 'email',
        value: { text: '[email protected]', email: '[email protected]' },
        description: 'Email колонка'
      },
      {
        type: 'phone',
        value: { phone: '+1234567890', countryShortName: 'US' },
        description: 'Телефон колонка'
      }
    ];

    for (const testCase of testCases) {
      const column = columns.find(col => col.type === testCase.type);
      
      if (column) {
        console.log(`\n🔧 Тестируем ${testCase.description} (${column.title})...`);
        
        try {
          const result = await mondayTool._call({
            action: 'updateColumn',
            boardId: boardId,
            itemId: itemId,
            columnId: column.id,
            value: testCase.value,
            createLabelsIfMissing: true
          });
          
          console.log(`✅ ${testCase.description} обновлена успешно`);
        } catch (error) {
          console.log(`❌ ${testCase.description} - ошибка:`, error.message);
        }
      } else {
        console.log(`⚠️ ${testCase.description} не найдена на доске`);
      }
    }

  } catch (error) {
    console.error('❌ Ошибка в расширенном тестировании:', error.message);
  }
}

// Запускаем тесты
async function runAllTests() {
  await testColumnUpdate();
  await testDifferentColumnTypes();
}

runAllTests().catch(console.error);
