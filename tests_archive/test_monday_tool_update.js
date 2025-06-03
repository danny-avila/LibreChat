const MondayTool = require('./api/app/clients/tools/structured/MondayTool');

async function testMondayColumnUpdate() {
  console.log('🔍 Тестируем существующую реализацию updateColumn в MondayTool...\n');

  const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';
  
  try {
    const mondayTool = new MondayTool({ apiKey });

    // 1. Получаем доски
    console.log('📋 Шаг 1: Получаем доски...');
    const boardsResult = await mondayTool._call({
      action: 'getBoards',
      limit: 1
    });

    const boardsData = JSON.parse(boardsResult);
    if (!boardsData.success || !boardsData.data.length) {
      console.error('❌ Не удалось получить доски');
      return;
    }

    const board = boardsData.data[0];
    console.log(`✅ Доска: "${board.name}" (ID: ${board.id})`);

    // 2. Получаем элементы
    console.log('\n📝 Шаг 2: Получаем элементы...');
    const itemsResult = await mondayTool._call({
      action: 'getItems',
      boardId: board.id,
      limit: 1
    });

    const itemsData = JSON.parse(itemsResult);
    if (!itemsData.success || !itemsData.data.length) {
      console.error('❌ Не удалось получить элементы');
      return;
    }

    const item = itemsData.data[0];
    console.log(`✅ Элемент: "${item.name}" (ID: ${item.id})`);

    // 3. Получаем информацию о колонках
    console.log('\n📊 Шаг 3: Получаем информацию о колонках...');
    const columnsResult = await mondayTool._call({
      action: 'getColumnsInfo',
      boardId: board.id
    });

    const columnsData = JSON.parse(columnsResult);
    if (!columnsData.success || !columnsData.data.length) {
      console.error('❌ Не удалось получить колонки');
      return;
    }

    // Найдем текстовую колонку
    const textColumn = columnsData.data.find(col => col.type === 'text');
    if (!textColumn) {
      console.error('❌ Не найдена текстовая колонка');
      return;
    }

    console.log(`✅ Текстовая колонка: "${textColumn.title}" (ID: ${textColumn.id})`);

    // 4. Тестируем updateColumn
    console.log('\n🔧 Шаг 4: Тестируем updateColumn...');
    const updateResult = await mondayTool._call({
      action: 'updateColumn',
      boardId: board.id,
      itemId: item.id,
      columnId: textColumn.id,
      value: `Тест обновления ${new Date().toLocaleString()}`
    });

    const updateData = JSON.parse(updateResult);
    if (updateData.success) {
      console.log('✅ updateColumn работает!');
      console.log('Результат:', updateData);
    } else {
      console.error('❌ updateColumn не работает:', updateData);
    }

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
}

testMondayColumnUpdate();
