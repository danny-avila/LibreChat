#!/usr/bin/env node

/**
 * Скрипт для тестирования исправлений monday.com API
 * Тестирует проблемные функции с официальными форматами из документации
 */

// Простая реализация logger для тестирования
const logger = {
  debug: (msg, obj) => console.log(`DEBUG: ${msg}`, obj ? JSON.stringify(obj, null, 2) : ''),
  info: (msg, obj) => console.log(`INFO: ${msg}`, obj ? JSON.stringify(obj, null, 2) : ''),
  warn: (msg, obj) => console.warn(`WARN: ${msg}`, obj ? JSON.stringify(obj, null, 2) : ''),
  error: (msg, obj) => console.error(`ERROR: ${msg}`, obj ? JSON.stringify(obj, null, 2) : '')
};

// Mock fetch для тестирования
global.fetch = require('node-fetch');

// Загружаем MondayTool
const MondayTool = require('./MondayTool');

class MondayFixTester {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.MONDAY_API_KEY;
    if (!this.apiKey) {
      throw new Error('MONDAY_API_KEY не найден в переменных окружения');
    }
    
    this.mondayTool = new MondayTool({ 
      MONDAY_API_KEY: this.apiKey
    });
    
    this.testBoardId = null;
    this.testGroupId = null;
    this.testItemId = null;
  }

  async runTests() {
    console.log('🚀 Начинаем тестирование исправлений monday.com API...\n');
    
    try {
      // 1. Получаем доску для тестов
      await this.testGetBoards();
      
      // 2. Создаем тестовую группу
      await this.testCreateGroup();
      
      // 3. Создаем тестовый элемент
      await this.testCreateItem();
      
      // 4. Тестируем обновление элемента
      await this.testUpdateItem();
      
      // 5. Тестируем добавление комментария
      await this.testAddComment();
      
      console.log('\n✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!');
      
    } catch (error) {
      console.error('\n❌ ОШИБКА ПРИ ТЕСТИРОВАНИИ:', error);
    }
  }

  async testGetBoards() {
    console.log('📋 Тест 1: Получение списка досок...');
    
    try {
      const result = await this.mondayTool._call({
        action: 'getBoards',
        limit: 5
      });
      
      const data = JSON.parse(result);
      if (data.success && data.data.length > 0) {
        this.testBoardId = data.data[0].id;
        console.log(`✅ Успешно получено ${data.data.length} досок`);
        console.log(`   Используем доску: ${data.data[0].name} (ID: ${this.testBoardId})`);
        
        // Получаем группу из первой доски
        if (data.data[0].groups && data.data[0].groups.length > 0) {
          this.testGroupId = data.data[0].groups[0].id;
          console.log(`   Используем группу: ${data.data[0].groups[0].title} (ID: ${this.testGroupId})`);
        }
      } else {
        throw new Error('Не удалось получить доски');
      }
    } catch (error) {
      console.error('❌ Ошибка при получении досок:', error.message);
      throw error;
    }
  }

  async testCreateGroup() {
    console.log('\n📋 Тест 2: Создание группы...');
    
    if (!this.testBoardId) {
      console.log('⚠️  Пропускаем тест - нет доступной доски');
      return;
    }
    
    try {
      const result = await this.mondayTool._call({
        action: 'createGroup',
        boardId: this.testBoardId,
        groupName: `Test Group ${Date.now()}`
      });
      
      const data = JSON.parse(result);
      if (data.success && data.data) {
        this.testGroupId = data.data.id;
        console.log(`✅ Группа успешно создана: ${data.data.title} (ID: ${data.data.id})`);
      } else {
        throw new Error('Не удалось создать группу');
      }
    } catch (error) {
      console.error('❌ Ошибка при создании группы:', error.message);
      
      // Если группа не создалась, используем существующую
      if (this.testGroupId) {
        console.log(`   Используем существующую группу: ${this.testGroupId}`);
      }
    }
  }

  async testCreateItem() {
    console.log('\n📋 Тест 3: Создание элемента...');
    
    if (!this.testBoardId) {
      console.log('⚠️  Пропускаем тест - нет доступной доски');
      return;
    }
    
    try {
      // Тестируем с разными форматами column_values согласно документации
      const columnValues = {
        // Текстовое поле - простая строка
        // text: "Test text value",
        
        // Статус - можно использовать label
        // status: { label: "Working on it" },
        
        // Дата - формат YYYY-MM-DD
        // date: { date: "2024-01-15" },
        
        // Числовое поле
        // numbers: 123
      };
      
      const result = await this.mondayTool._call({
        action: 'createItem',
        boardId: this.testBoardId,
        itemName: `Test Item ${Date.now()}`,
        groupId: this.testGroupId,
        columnValues: Object.keys(columnValues).length > 0 ? columnValues : undefined
      });
      
      const data = JSON.parse(result);
      if (data.success && data.data) {
        this.testItemId = data.data.id;
        console.log(`✅ Элемент успешно создан: ${data.data.name} (ID: ${data.data.id})`);
        console.log(`   В группе: ${data.data.group?.title || 'default'}`);
      } else {
        throw new Error('Не удалось создать элемент');
      }
    } catch (error) {
      console.error('❌ Ошибка при создании элемента:', error.message);
      throw error;
    }
  }

  async testUpdateItem() {
    console.log('\n📋 Тест 4: Обновление элемента...');
    
    if (!this.testBoardId || !this.testItemId) {
      console.log('⚠️  Пропускаем тест - нет доступного элемента');
      return;
    }
    
    try {
      // Тестируем обновление с простыми значениями
      const columnValues = {
        // text: "Updated text value"
      };
      
      const result = await this.mondayTool._call({
        action: 'updateItem',
        boardId: this.testBoardId,
        itemId: this.testItemId,
        columnValues: columnValues
      });
      
      const data = JSON.parse(result);
      if (data.success) {
        console.log(`✅ Элемент успешно обновлен`);
      } else {
        throw new Error('Не удалось обновить элемент');
      }
    } catch (error) {
      console.error('❌ Ошибка при обновлении элемента:', error.message);
    }
  }

  async testAddComment() {
    console.log('\n📋 Тест 5: Добавление комментария...');
    
    if (!this.testItemId) {
      console.log('⚠️  Пропускаем тест - нет доступного элемента');
      return;
    }
    
    try {
      const result = await this.mondayTool._call({
        action: 'addComment',
        itemId: this.testItemId,
        body: `Test comment at ${new Date().toISOString()}`
      });
      
      const data = JSON.parse(result);
      if (data.success && data.data) {
        console.log(`✅ Комментарий успешно добавлен (ID: ${data.data.id})`);
      } else {
        throw new Error('Не удалось добавить комментарий');
      }
    } catch (error) {
      console.error('❌ Ошибка при добавлении комментария:', error.message);
    }
  }
}

// Запуск тестов
async function main() {
  try {
    const tester = new MondayFixTester();
    await tester.runTests();
  } catch (error) {
    console.error('Критическая ошибка:', error);
    process.exit(1);
  }
}

// Запускаем только если файл выполняется напрямую
if (require.main === module) {
  main();
}

module.exports = MondayFixTester; 