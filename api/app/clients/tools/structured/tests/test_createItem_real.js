const MondayTool = require('./MondayTool');

/**
 * Реальный тест createItem с продакшен API ключом
 */
async function testCreateItem() {
  const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';
  const mondayTool = new MondayTool({ apiKey });
  
  // Используем реальную тестовую доску
  const testBoardId = '9261805849'; // "Test Board Created by Tool"
  
  console.log('🚀 Тестируем createItem с реальными данными...\n');

  try {
    // Шаг 1: Получаем информацию о доске
    console.log('📋 Шаг 1: Получаем информацию о доске...');
    const boardInfo = await mondayTool._call({
      action: 'getBoard',
      boardId: testBoardId,
      includeGroups: true,
      includeColumns: true,
      includeItems: false
    });
    
    const board = JSON.parse(boardInfo);
    console.log(`✅ Доска получена: ${board.data.name}`);
    console.log(`📊 Групп: ${board.data.groups?.length || 0}`);
    console.log(`📊 Колонок: ${board.data.columns?.length || 0}`);
    
    if (board.data.groups && board.data.groups.length > 0) {
      console.log('📋 Группы:');
      board.data.groups.forEach((group, index) => {
        console.log(`   ${index + 1}. ${group.title} (ID: ${group.id})`);
      });
    }
    
    if (board.data.columns && board.data.columns.length > 0) {
      console.log('📋 Колонки:');
      board.data.columns.forEach((column, index) => {
        console.log(`   ${index + 1}. ${column.title} (ID: ${column.id}, Type: ${column.type})`);
      });
    }

    // Шаг 2: Простое создание элемента
    console.log('\n📋 Шаг 2: Создаем простой элемент...');
    const simpleResult = await mondayTool._call({
      action: 'createItem',
      boardId: testBoardId,
      itemName: `Диагностический тест ${Date.now()}`,
      groupId: board.data.groups?.[0]?.id
    });
    
    const simpleItem = JSON.parse(simpleResult);
    if (simpleItem.success) {
      console.log(`✅ Простой элемент создан: ${simpleItem.data.name} (ID: ${simpleItem.data.id})`);
    } else {
      console.log(`❌ Ошибка создания простого элемента:`, simpleItem);
    }

    // Шаг 3: Создание элемента с простыми column_values
    console.log('\n📋 Шаг 3: Создаем элемент с простыми column_values...');
    
    // Найдем простые колонки для тестирования
    const textColumn = board.data.columns?.find(c => c.type === 'text');
    const numberColumn = board.data.columns?.find(c => c.type === 'numbers');
    
    if (textColumn || numberColumn) {
      const columnValues = {};
      
      if (textColumn) {
        columnValues[textColumn.id] = "Тестовое описание";
        console.log(`   Будем заполнять текстовую колонку: ${textColumn.title} (${textColumn.id})`);
      }
      
      if (numberColumn) {
        columnValues[numberColumn.id] = 42;
        console.log(`   Будем заполнять числовую колонку: ${numberColumn.title} (${numberColumn.id})`);
      }
      
      console.log(`   Column values: ${JSON.stringify(columnValues, null, 2)}`);
      
      const columnResult = await mondayTool._call({
        action: 'createItem',
        boardId: testBoardId,
        itemName: `Элемент с данными ${Date.now()}`,
        groupId: board.data.groups?.[0]?.id,
        columnValues: columnValues,
        createLabelsIfMissing: true
      });
      
      const columnItem = JSON.parse(columnResult);
      if (columnItem.success) {
        console.log(`✅ Элемент с данными создан: ${columnItem.data.name} (ID: ${columnItem.data.id})`);
        console.log(`   Колонок заполнено: ${columnItem.data.column_values?.length || 0}`);
      } else {
        console.log(`❌ Ошибка создания элемента с данными:`, columnItem);
      }
    } else {
      console.log('⚠️ Подходящие колонки не найдены для тестирования column_values');
    }

    // Шаг 4: Получение элементов для проверки
    console.log('\n📋 Шаг 4: Проверяем созданные элементы...');
    const itemsResult = await mondayTool._call({
      action: 'getItems',
      boardId: testBoardId,
      limit: 5,
      columnValues: true
    });
    
    const items = JSON.parse(itemsResult);
    if (items.success) {
      console.log(`✅ Получено элементов: ${items.data.length}`);
      items.data.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.name} (ID: ${item.id})`);
      });
    } else {
      console.log(`❌ Ошибка получения элементов:`, items);
    }

    console.log('\n🎯 Тест createItem завершен успешно!');
    
  } catch (error) {
    console.error('\n💥 Ошибка в тесте:', error.message);
    console.error('Детали:', error.stack);
  }
}

// Запуск теста
testCreateItem(); 