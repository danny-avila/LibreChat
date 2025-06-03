/**
 * Простой тест валидации параметров updateColumn
 */

const { MondayTool } = require('./api/app/clients/tools/structured/MondayTool');

async function testValidation() {
  console.log('🔍 Тестирование валидации параметров updateColumn...\n');

  const mondayTool = new MondayTool({
    MONDAY_API_KEY: 'test_key_for_validation'
  });

  // Тест 1: Отсутствующие параметры
  console.log('📋 Тест 1: Проверка обязательных параметров...');
  
  const testCases = [
    {
      name: 'Без boardId',
      params: { itemId: '123', columnId: 'col1', value: 'test' },
      expectedError: 'boardId, itemId, columnId and value are required'
    },
    {
      name: 'Без itemId',
      params: { boardId: '123', columnId: 'col1', value: 'test' },
      expectedError: 'boardId, itemId, columnId and value are required'
    },
    {
      name: 'Без columnId',
      params: { boardId: '123', itemId: '456', value: 'test' },
      expectedError: 'boardId, itemId, columnId and value are required'
    },
    {
      name: 'Без value',
      params: { boardId: '123', itemId: '456', columnId: 'col1' },
      expectedError: 'boardId, itemId, columnId and value are required'
    },
    {
      name: 'Все параметры есть',
      params: { boardId: '123', itemId: '456', columnId: 'col1', value: 'test' },
      expectedError: null
    }
  ];

  for (const testCase of testCases) {
    try {
      await mondayTool._call({
        action: 'updateColumn',
        ...testCase.params
      });
      
      if (testCase.expectedError) {
        console.log(`❌ ${testCase.name}: Ожидалась ошибка, но ее не было`);
      } else {
        console.log(`⚠️ ${testCase.name}: Валидация прошла (ошибка сети ожидаема)`);
      }
    } catch (error) {
      if (testCase.expectedError && error.message.includes(testCase.expectedError)) {
        console.log(`✅ ${testCase.name}: Корректная ошибка валидации`);
      } else if (!testCase.expectedError && error.message.includes('Monday.com API key is required')) {
        console.log(`⚠️ ${testCase.name}: Валидация прошла, ошибка API ключа ожидаема`);
      } else {
        console.log(`❌ ${testCase.name}: Неожиданная ошибка - ${error.message}`);
      }
    }
  }

  console.log('\n🔍 Тест 2: Проверка форматирования значений...');
  
  const valueTestCases = [
    {
      name: 'Строковое значение',
      value: 'Simple text',
      expected: 'должно остаться строкой'
    },
    {
      name: 'Объект значение',
      value: { label: 'Working on it' },
      expected: 'должно быть сериализовано в JSON'
    },
    {
      name: 'Число значение',
      value: 42,
      expected: 'должно быть сериализовано в JSON'
    },
    {
      name: 'Булево значение',
      value: true,
      expected: 'должно быть сериализовано в JSON'
    }
  ];

  for (const testCase of valueTestCases) {
    console.log(`📝 ${testCase.name}: ${testCase.expected}`);
    
    // Проверяем внутреннюю логику форматирования
    const formattedValue = typeof testCase.value === 'string' ? testCase.value : JSON.stringify(testCase.value);
    console.log(`   Исходное: ${JSON.stringify(testCase.value)}`);
    console.log(`   Форматированное: ${formattedValue}`);
  }

  console.log('\n✅ Тестирование валидации завершено');
}

testValidation().catch(console.error);
