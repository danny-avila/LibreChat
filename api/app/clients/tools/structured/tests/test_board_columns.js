const MondayTool = require('./MondayTool');

async function testBoardColumns() {
  const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';
  const testBoardId = '9261805849';
  
  console.log('📋 Проверяем доступные колонки на доске...\n');

  try {
    const mondayTool = new MondayTool({ apiKey });
    const result = await mondayTool._call({
      action: 'getColumnsInfo',
      boardId: testBoardId
    });

    const parsed = JSON.parse(result);
    if (parsed.success) {
      console.log('✅ Найдены колонки:');
      parsed.data.forEach((column, index) => {
        console.log(`${index + 1}. ID: "${column.id}" | Название: "${column.title}" | Тип: ${column.type}`);
      });
    } else {
      console.log('❌ Ошибка получения колонок:', parsed.error);
    }
  } catch (error) {
    console.log('❌ Исключение:', error.message);
  }
}

testBoardColumns(); 