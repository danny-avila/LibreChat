const { MondayTool } = require('./MondayTool');

/**
 * Тестовый скрипт для проверки исправлений createItem
 * Проверяет различные форматы column_values согласно официальной документации Monday.com
 */
class CreateItemFixTester {
  constructor(apiKey) {
    this.mondayTool = new MondayTool({ apiKey });
    this.testBoardId = null;
    this.testGroupId = null;
  }

  async runTests() {
    console.log('🚀 Запуск тестов исправлений createItem...\n');
    
    try {
      // Тест 1: Простое создание элемента
      await this.testSimpleCreateItem();
      
      // Тест 2: Создание с базовыми колонками
      await this.testBasicColumns();
      
      // Тест 3: Создание с расширенными колонками
      await this.testAdvancedColumns();
      
      // Тест 4: Создание с различными типами колонок
      await this.testAllColumnTypes();
      
      console.log('\n✅ Все тесты завершены успешно!');
      
    } catch (error) {
      console.error('\n❌ Ошибка в тестах:', error.message);
      throw error;
    }
  }

  async testSimpleCreateItem() {
    console.log('📋 Тест 1: Простое создание элемента без column_values...');
    
    try {
      const result = await this.mondayTool._call({
        action: 'createItem',
        boardId: this.testBoardId || '1234567890', // Используйте реальный board ID
        itemName: `Тестовый элемент ${Date.now()}`
      });
      
      const data = JSON.parse(result);
      if (data.success && data.data) {
        console.log(`✅ Элемент создан: ${data.data.name} (ID: ${data.data.id})`);
        return data.data.id;
      } else {
        throw new Error('Не удалось создать простой элемент');
      }
    } catch (error) {
      console.error('❌ Ошибка в простом создании:', error.message);
      throw error;
    }
  }

  async testBasicColumns() {
    console.log('\n📋 Тест 2: Создание с базовыми колонками...');
    
    try {
      const columnValues = {
        // Текст - простая строка
        "text": "Описание тестовой задачи",
        
        // Число
        "numbers": 42,
        
        // Статус - объект с label
        "status": { "label": "В работе" }
      };
      
      const result = await this.mondayTool._call({
        action: 'createItem',
        boardId: this.testBoardId || '1234567890',
        itemName: `Элемент с данными ${Date.now()}`,
        columnValues: columnValues,
        createLabelsIfMissing: true
      });
      
      const data = JSON.parse(result);
      if (data.success && data.data) {
        console.log(`✅ Элемент с базовыми колонками создан: ${data.data.name}`);
        console.log(`   Колонки: ${data.data.column_values?.length || 0} значений`);
        return data.data.id;
      } else {
        throw new Error('Не удалось создать элемент с базовыми колонками');
      }
    } catch (error) {
      console.error('❌ Ошибка с базовыми колонками:', error.message);
      throw error;
    }
  }

  async testAdvancedColumns() {
    console.log('\n📋 Тест 3: Создание с расширенными колонками...');
    
    try {
      const columnValues = {
        // Текст
        "text": "Расширенное описание",
        
        // Дата - формат YYYY-MM-DD
        "date": { "date": "2024-12-31" },
        
        // Временная шкала
        "timeline": { 
          "from": "2024-01-01", 
          "to": "2024-01-31" 
        },
        
        // Email
        "email": "test@example.com",
        
        // Checkbox
        "checkbox": true
      };
      
      const result = await this.mondayTool._call({
        action: 'createItem',
        boardId: this.testBoardId || '1234567890',
        itemName: `Расширенный элемент ${Date.now()}`,
        groupId: this.testGroupId,
        columnValues: columnValues,
        createLabelsIfMissing: true
      });
      
      const data = JSON.parse(result);
      if (data.success && data.data) {
        console.log(`✅ Расширенный элемент создан: ${data.data.name}`);
        console.log(`   В группе: ${data.data.group?.title || 'default'}`);
        return data.data.id;
      } else {
        throw new Error('Не удалось создать расширенный элемент');
      }
    } catch (error) {
      console.error('❌ Ошибка с расширенными колонками:', error.message);
      // Не прерываем тест, так как может не быть всех типов колонок
      console.log('⚠️  Возможно, на доске нет всех требуемых типов колонок');
    }
  }

  async testAllColumnTypes() {
    console.log('\n📋 Тест 4: Тестирование различных типов колонок...');
    
    const testCases = [
      {
        name: 'Только текст',
        columnValues: { "text": "Простой текст" }
      },
      {
        name: 'Только число',
        columnValues: { "numbers": 123 }
      },
      {
        name: 'Статус с index',
        columnValues: { "status": { "index": 1 } }
      },
      {
        name: 'Статус с label',
        columnValues: { "status": { "label": "Готово" } }
      },
      {
        name: 'Дата',
        columnValues: { "date": { "date": "2024-06-15" } }
      },
      {
        name: 'Люди (если есть пользователи)',
        columnValues: { 
          "people": { 
            "personsAndTeams": [{ "id": 12345, "kind": "person" }] 
          } 
        }
      }
    ];
    
    for (const testCase of testCases) {
      try {
        console.log(`   Тестируем: ${testCase.name}...`);
        
        const result = await this.mondayTool._call({
          action: 'createItem',
          boardId: this.testBoardId || '1234567890',
          itemName: `${testCase.name} ${Date.now()}`,
          columnValues: testCase.columnValues,
          createLabelsIfMissing: true
        });
        
        const data = JSON.parse(result);
        if (data.success && data.data) {
          console.log(`   ✅ ${testCase.name}: Успешно`);
        } else {
          console.log(`   ❌ ${testCase.name}: Неудача`);
        }
      } catch (error) {
        console.log(`   ⚠️  ${testCase.name}: ${error.message}`);
      }
    }
  }

  // Вспомогательный метод для получения информации о досках
  async getBoardInfo() {
    try {
      const result = await this.mondayTool._call({
        action: 'getBoards',
        limit: 5
      });
      
      const data = JSON.parse(result);
      if (data.success && data.data.length > 0) {
        console.log('\n📊 Доступные доски:');
        data.data.forEach((board, index) => {
          console.log(`   ${index + 1}. ${board.name} (ID: ${board.id})`);
        });
        return data.data[0].id; // Возвращаем ID первой доски
      }
    } catch (error) {
      console.error('Не удалось получить информацию о досках:', error.message);
    }
    return null;
  }

  // Вспомогательный метод для получения информации о колонках
  async getColumnInfo(boardId) {
    try {
      const result = await this.mondayTool._call({
        action: 'getColumnsInfo',
        boardId: boardId
      });
      
      const data = JSON.parse(result);
      if (data.success && data.data.length > 0) {
        console.log('\n📊 Колонки доски:');
        data.data.forEach((column, index) => {
          console.log(`   ${index + 1}. ${column.title} (ID: ${column.id}, Type: ${column.type})`);
        });
      }
    } catch (error) {
      console.error('Не удалось получить информацию о колонках:', error.message);
    }
  }
}

// Экспорт для использования в других скриптах
module.exports = { CreateItemFixTester };

// Запуск тестов если скрипт выполняется напрямую
if (require.main === module) {
  const apiKey = process.env.MONDAY_API_KEY;
  
  if (!apiKey) {
    console.error('❌ Установите переменную окружения MONDAY_API_KEY');
    process.exit(1);
  }
  
  const tester = new CreateItemFixTester(apiKey);
  
  // Сначала получаем информацию о досках
  tester.getBoardInfo()
    .then(boardId => {
      if (boardId) {
        tester.testBoardId = boardId;
        return tester.getColumnInfo(boardId);
      }
    })
    .then(() => {
      return tester.runTests();
    })
    .catch(error => {
      console.error('💥 Тест провален:', error.message);
      process.exit(1);
    });
} 