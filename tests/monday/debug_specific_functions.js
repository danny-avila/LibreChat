const MondayTool = require('./../../api/app/clients/tools/structured/MondayTool');

const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';

// Создаем инструмент с отладкой
class DebugMondayTool extends MondayTool {
  async makeGraphQLRequest(query, variables = {}) {
    console.log('🔍 DEBUG: Отправляемый запрос:');
    console.log('Query:', query);
    console.log('Variables:', JSON.stringify(variables, null, 2));
    
    return await super.makeGraphQLRequest(query, variables);
  }
}

const tool = new DebugMondayTool({ apiKey });

async function testSpecificFunctions() {
  const tests = [
    {
      name: 'createNotification',
      input: {
        action: 'createNotification',
        userId: '17719660',
        targetId: '9261805849',
        text: 'Test notification via API',
        targetType: 'Board'
      }
    },
    {
      name: 'changeColumnValue',
      input: {
        action: 'changeColumnValue',
        boardId: '9261805849',
        itemId: '9271051288',
        columnId: 'text_mkre1hm2',
        value: 'Updated via changeColumnValue API'
      }
    },
    {
      name: 'changeSimpleColumnValue',
      input: {
        action: 'changeSimpleColumnValue',
        boardId: '9261805849',
        itemId: '9271051288',
        columnId: 'text_mkre1hm2',
        value: 'Simple value update'
      }
    }
  ];

  for (const test of tests) {
    console.log(`\n🔍 Тестируем: ${test.name}`);
    console.log('Параметры:', JSON.stringify(test.input, null, 2));

    try {
      const result = await tool._call(test.input);
      console.log('✅ Результат:', result);
    } catch (error) {
      console.error('❌ Ошибка:', error.message);
    }

    // Пауза между тестами
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

testSpecificFunctions(); 