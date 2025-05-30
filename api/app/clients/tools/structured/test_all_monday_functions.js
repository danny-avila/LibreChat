const MondayTool = require('./MondayTool');

/**
 * Комплексный тест всех функций Monday.com API
 * Проверяет и исправляет проблемы во всех методах
 */
class MondayAPITester {
  constructor(apiKey) {
    this.mondayTool = new MondayTool({ apiKey });
    this.testBoardId = '9261805849'; // Test Board Created by Tool
    this.results = [];
    this.createdItems = [];
  }

  log(message, status = 'info') {
    const timestamp = new Date().toISOString();
    const result = { timestamp, status, message };
    this.results.push(result);
    
    const emoji = {
      'success': '✅',
      'error': '❌', 
      'warning': '⚠️',
      'info': '📋'
    }[status] || '📋';
    
    console.log(`${emoji} ${message}`);
  }

  async runAllTests() {
    this.log('🚀 Запуск комплексного тестирования Monday.com API...\n');
    
    try {
      // Группа 1: Базовые операции с досками
      await this.testBoardOperations();
      
      // Группа 2: Операции с элементами
      await this.testItemOperations();
      
      // Группа 3: Операции с колонками и группами
      await this.testStructureOperations();
      
      // Группа 4: Поиск и получение данных
      await this.testDataRetrieval();
      
      // Группа 5: Дополнительные операции
      await this.testAdditionalOperations();
      
      // Очистка тестовых данных
      await this.cleanup();
      
      this.printSummary();
      
    } catch (error) {
      this.log(`💥 Критическая ошибка: ${error.message}`, 'error');
    }
  }

  async testBoardOperations() {
    this.log('\n📋 === ТЕСТИРОВАНИЕ ОПЕРАЦИЙ С ДОСКАМИ ===\n');
    
    // Тест 1: getBoards (уже исправлено)
    await this.testFunction('getBoards', {
      action: 'getBoards',
      limit: 5
    });
    
    // Тест 2: getBoard - получение деталей доски
    await this.testFunction('getBoard', {
      action: 'getBoard',
      boardId: this.testBoardId,
      includeGroups: true,
      includeColumns: true,
      includeItems: false
    });
    
    // Тест 3: getWorkspaces
    await this.testFunction('getWorkspaces', {
      action: 'getWorkspaces',
      limit: 5
    });
    
    // Тест 4: getColumnsInfo
    await this.testFunction('getColumnsInfo', {
      action: 'getColumnsInfo',
      boardId: this.testBoardId
    });
  }

  async testItemOperations() {
    this.log('\n📋 === ТЕСТИРОВАНИЕ ОПЕРАЦИЙ С ЭЛЕМЕНТАМИ ===\n');
    
    // Тест 5: createItem (простое создание)
    const simpleItem = await this.testFunction('createItem (простое)', {
      action: 'createItem',
      boardId: this.testBoardId,
      itemName: `Тестовый элемент ${Date.now()}`
    });
    
    if (simpleItem && simpleItem.data && simpleItem.data.id) {
      this.createdItems.push(simpleItem.data.id);
    }
    
    // Тест 6: createItem с column_values
    const advancedItem = await this.testFunction('createItem (с данными)', {
      action: 'createItem',
      boardId: this.testBoardId,
      itemName: `Элемент с данными ${Date.now()}`,
      columnValues: {
        // Будем тестировать с простыми значениями
        'text': 'Тестовое описание',
        'numbers': 42
      },
      createLabelsIfMissing: true
    });
    
    if (advancedItem && advancedItem.data && advancedItem.data.id) {
      this.createdItems.push(advancedItem.data.id);
    }
    
    // Тест 7: getItems
    await this.testFunction('getItems', {
      action: 'getItems',
      boardId: this.testBoardId,
      limit: 5,
      includeColumnValues: true
    });
    
    // Тест 8: updateItem (если есть созданные элементы)
    if (this.createdItems.length > 0) {
      await this.testFunction('updateItem', {
        action: 'updateItem',
        boardId: this.testBoardId,
        itemId: this.createdItems[0],
        columnValues: {
          'text': 'Обновленное описание'
        }
      });
    }
  }

  async testStructureOperations() {
    this.log('\n📋 === ТЕСТИРОВАНИЕ СТРУКТУРНЫХ ОПЕРАЦИЙ ===\n');
    
    // Тест 9: createGroup
    const newGroup = await this.testFunction('createGroup', {
      action: 'createGroup',
      boardId: this.testBoardId,
      groupName: `Тестовая группа ${Date.now()}`,
      color: '#FF0000'
    });
    
    // Тест 10: updateColumn (если есть элементы)
    if (this.createdItems.length > 0) {
      await this.testFunction('updateColumn', {
        action: 'updateColumn',
        boardId: this.testBoardId,
        itemId: this.createdItems[0],
        columnId: 'text',
        value: 'Обновленное значение колонки'
      });
    }
    
    // Тест 11: addComment (если есть элементы)
    if (this.createdItems.length > 0) {
      await this.testFunction('addComment', {
        action: 'addComment',
        itemId: this.createdItems[0],
        body: 'Тестовый комментарий от API'
      });
    }
  }

  async testDataRetrieval() {
    this.log('\n📋 === ТЕСТИРОВАНИЕ ПОЛУЧЕНИЯ ДАННЫХ ===\n');
    
    // Тест 12: searchItems
    await this.testFunction('searchItems', {
      action: 'searchItems',
      boardId: this.testBoardId,
      query: 'Тестовый',
      limit: 5
    });
    
    // Тест 13: getUsers
    await this.testFunction('getUsers', {
      action: 'getUsers',
      limit: 5
    });
  }

  async testAdditionalOperations() {
    this.log('\n📋 === ТЕСТИРОВАНИЕ ДОПОЛНИТЕЛЬНЫХ ОПЕРАЦИЙ ===\n');
    
    // Тест 14: getUsersExtended
    await this.testFunction('getUsersExtended', {
      action: 'getUsersExtended',
      limit: 5
    });
    
    // Тест 15: getAccount
    await this.testFunction('getAccount', {
      action: 'getAccount'
    });
  }

  async testFunction(name, params) {
    this.log(`Тестируем: ${name}...`);
    
    try {
      const result = await this.mondayTool._call(params);
      const data = JSON.parse(result);
      
      if (data.success) {
        this.log(`✅ ${name}: Успешно`, 'success');
        if (data.data) {
          if (Array.isArray(data.data)) {
            this.log(`   Получено записей: ${data.data.length}`);
          } else if (data.data.id) {
            this.log(`   ID результата: ${data.data.id}`);
          }
        }
        return data;
      } else {
        this.log(`❌ ${name}: Неуспешно - ${data.error}`, 'error');
        return null;
      }
    } catch (error) {
      this.log(`❌ ${name}: Ошибка - ${error.message}`, 'error');
      return null;
    }
  }

  async cleanup() {
    this.log('\n📋 === ОЧИСТКА ТЕСТОВЫХ ДАННЫХ ===\n');
    
    for (const itemId of this.createdItems) {
      try {
        await this.testFunction(`deleteItem (${itemId})`, {
          action: 'deleteItem',
          itemId: itemId
        });
      } catch (error) {
        this.log(`⚠️ Не удалось удалить элемент ${itemId}`, 'warning');
      }
    }
  }

  printSummary() {
    this.log('\n📊 === СВОДКА РЕЗУЛЬТАТОВ ТЕСТИРОВАНИЯ ===\n');
    
    const successful = this.results.filter(r => r.status === 'success');
    const errors = this.results.filter(r => r.status === 'error');
    const warnings = this.results.filter(r => r.status === 'warning');
    
    this.log(`✅ Успешных тестов: ${successful.length}`, 'success');
    this.log(`❌ Неуспешных тестов: ${errors.length}`, errors.length > 0 ? 'error' : 'success');
    this.log(`⚠️ Предупреждений: ${warnings.length}`, warnings.length > 0 ? 'warning' : 'success');
    
    if (errors.length > 0) {
      this.log('\n🔍 Функции с ошибками:');
      errors.forEach((error, index) => {
        this.log(`   ${index + 1}. ${error.message}`, 'error');
      });
    }
    
    // Сохранение результатов
    this.saveResults();
  }

  saveResults() {
    const fs = require('fs');
    const resultsFile = `monday_all_functions_test_${Date.now()}.json`;
    
    try {
      fs.writeFileSync(resultsFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        total_tests: this.results.length,
        successful: this.results.filter(r => r.status === 'success').length,
        errors: this.results.filter(r => r.status === 'error').length,
        warnings: this.results.filter(r => r.status === 'warning').length,
        results: this.results
      }, null, 2));
      
      this.log(`📁 Результаты сохранены: ${resultsFile}`);
    } catch (error) {
      this.log(`❌ Не удалось сохранить результаты: ${error.message}`, 'error');
    }
  }
}

// Запуск тестирования
const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';

const tester = new MondayAPITester(apiKey);
tester.runAllTests(); 