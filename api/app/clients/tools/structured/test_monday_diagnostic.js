const MondayTool = require('./MondayTool');

/**
 * Диагностический тест для Monday.com API
 * Проверяет createItem и другие функции с реальным API ключом
 */
class MondayDiagnostic {
  constructor(apiKey) {
    this.mondayTool = new MondayTool({ apiKey });
    this.testResults = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, type, message };
    this.testResults.push(logEntry);
    
    const prefix = {
      'info': '📋',
      'success': '✅',
      'error': '❌',
      'warning': '⚠️'
    }[type] || '📋';
    
    console.log(`${prefix} ${message}`);
  }

  async runDiagnostic() {
    this.log('🚀 Запуск диагностики Monday.com API...');
    
    try {
      // Тест 1: Базовое подключение - получение досок
      const boards = await this.testGetBoards();
      
      if (boards && boards.length > 0) {
        const testBoard = boards[0];
        this.log(`📋 Используем доску для тестов: ${testBoard.name} (ID: ${testBoard.id})`);
        
        // Тест 2: Получение информации о колонках
        const columns = await this.testGetColumns(testBoard.id);
        
        // Тест 3: Получение групп доски
        const groups = await this.testGetGroups(testBoard.id);
        
        // Тест 4: Простое создание элемента
        await this.testSimpleCreateItem(testBoard.id, groups?.[0]?.id);
        
        // Тест 5: Создание элемента с column_values
        if (columns && columns.length > 0) {
          await this.testCreateItemWithColumns(testBoard.id, columns, groups?.[0]?.id);
        }
        
        // Тест 6: Получение элементов
        await this.testGetItems(testBoard.id);
      }
      
      this.log('🎯 Диагностика завершена');
      this.printSummary();
      
    } catch (error) {
      this.log(`💥 Критическая ошибка: ${error.message}`, 'error');
      throw error;
    }
  }

  async testGetBoards() {
    this.log('Тест 1: Получение списка досок...');
    
    try {
      const result = await this.mondayTool._call({
        action: 'getBoards',
        limit: 10
      });
      
      const data = JSON.parse(result);
      if (data.success && data.data) {
        this.log(`✅ Получено досок: ${data.data.length}`, 'success');
        data.data.forEach((board, index) => {
          this.log(`   ${index + 1}. ${board.name} (ID: ${board.id}, State: ${board.state})`);
        });
        return data.data;
      } else {
        throw new Error('Не удалось получить доски');
      }
    } catch (error) {
      this.log(`❌ Ошибка получения досок: ${error.message}`, 'error');
      return null;
    }
  }

  async testGetColumns(boardId) {
    this.log(`Тест 2: Получение колонок доски ${boardId}...`);
    
    try {
      const result = await this.mondayTool._call({
        action: 'getColumnsInfo',
        boardId: boardId
      });
      
      const data = JSON.parse(result);
      if (data.success && data.data) {
        this.log(`✅ Получено колонок: ${data.data.length}`, 'success');
        data.data.forEach((column, index) => {
          this.log(`   ${index + 1}. ${column.title} (ID: ${column.id}, Type: ${column.type})`);
        });
        return data.data;
      } else {
        throw new Error('Не удалось получить колонки');
      }
    } catch (error) {
      this.log(`❌ Ошибка получения колонок: ${error.message}`, 'error');
      return null;
    }
  }

  async testGetGroups(boardId) {
    this.log(`Тест 2.5: Получение групп доски ${boardId}...`);
    
    try {
      const result = await this.mondayTool._call({
        action: 'getBoard',
        boardId: boardId,
        includeGroups: true,
        includeColumns: false,
        includeItems: false
      });
      
      const data = JSON.parse(result);
      if (data.success && data.data && data.data.groups) {
        this.log(`✅ Получено групп: ${data.data.groups.length}`, 'success');
        data.data.groups.forEach((group, index) => {
          this.log(`   ${index + 1}. ${group.title} (ID: ${group.id})`);
        });
        return data.data.groups;
      } else {
        this.log(`⚠️ Группы не найдены`, 'warning');
        return null;
      }
    } catch (error) {
      this.log(`❌ Ошибка получения групп: ${error.message}`, 'error');
      return null;
    }
  }

  async testSimpleCreateItem(boardId, groupId) {
    this.log('Тест 3: Простое создание элемента (без column_values)...');
    
    try {
      const itemName = `Диагностический тест ${Date.now()}`;
      const params = {
        action: 'createItem',
        boardId: boardId,
        itemName: itemName
      };
      
      if (groupId) {
        params.groupId = groupId;
        this.log(`   Используем группу: ${groupId}`);
      }
      
      this.log(`   Создаем элемент: ${itemName}`);
      this.log(`   Параметры: ${JSON.stringify(params, null, 2)}`);
      
      const result = await this.mondayTool._call(params);
      
      const data = JSON.parse(result);
      if (data.success && data.data) {
        this.log(`✅ Элемент создан: ${data.data.name} (ID: ${data.data.id})`, 'success');
        this.log(`   Группа: ${data.data.group?.title || 'default'}`);
        return data.data.id;
      } else {
        this.log(`❌ Неудача создания. Ответ: ${JSON.stringify(data)}`, 'error');
        return null;
      }
    } catch (error) {
      this.log(`❌ Ошибка создания простого элемента: ${error.message}`, 'error');
      this.log(`   Детали ошибки: ${error.stack}`, 'error');
      return null;
    }
  }

  async testCreateItemWithColumns(boardId, columns, groupId) {
    this.log('Тест 4: Создание элемента с column_values...');
    
    // Найдем простые колонки для тестирования
    const textColumn = columns.find(c => c.type === 'text');
    const numberColumn = columns.find(c => c.type === 'numbers');
    const statusColumn = columns.find(c => c.type === 'status');
    
    const columnValues = {};
    
    if (textColumn) {
      columnValues[textColumn.id] = "Тестовый текст";
      this.log(`   Добавляем текст в колонку: ${textColumn.title} (${textColumn.id})`);
    }
    
    if (numberColumn) {
      columnValues[numberColumn.id] = 42;
      this.log(`   Добавляем число в колонку: ${numberColumn.title} (${numberColumn.id})`);
    }
    
    if (statusColumn) {
      // Пробуем простой формат с label
      columnValues[statusColumn.id] = { "label": "Done" };
      this.log(`   Добавляем статус в колонку: ${statusColumn.title} (${statusColumn.id})`);
    }
    
    if (Object.keys(columnValues).length === 0) {
      this.log('⚠️ Не найдено подходящих колонок для тестирования', 'warning');
      return;
    }
    
    try {
      const itemName = `Элемент с данными ${Date.now()}`;
      const params = {
        action: 'createItem',
        boardId: boardId,
        itemName: itemName,
        columnValues: columnValues,
        createLabelsIfMissing: true
      };
      
      if (groupId) {
        params.groupId = groupId;
      }
      
      this.log(`   Создаем элемент: ${itemName}`);
      this.log(`   Column values: ${JSON.stringify(columnValues, null, 2)}`);
      this.log(`   Полные параметры: ${JSON.stringify(params, null, 2)}`);
      
      const result = await this.mondayTool._call(params);
      
      const data = JSON.parse(result);
      if (data.success && data.data) {
        this.log(`✅ Элемент с данными создан: ${data.data.name} (ID: ${data.data.id})`, 'success');
        this.log(`   Колонок заполнено: ${data.data.column_values?.length || 0}`);
        return data.data.id;
      } else {
        this.log(`❌ Неудача создания с column_values. Ответ: ${JSON.stringify(data)}`, 'error');
      }
    } catch (error) {
      this.log(`❌ Ошибка создания элемента с column_values: ${error.message}`, 'error');
      this.log(`   Детали ошибки: ${error.stack}`, 'error');
      
      // Пробуем еще раз с более простыми значениями
      await this.testCreateItemSimpleColumns(boardId, columns, groupId);
    }
  }

  async testCreateItemSimpleColumns(boardId, columns, groupId) {
    this.log('Тест 4.1: Повторная попытка с упрощенными column_values...');
    
    const textColumn = columns.find(c => c.type === 'text');
    
    if (!textColumn) {
      this.log('⚠️ Текстовая колонка не найдена для упрощенного теста', 'warning');
      return;
    }
    
    try {
      const columnValues = {
        [textColumn.id]: "Простой текст"
      };
      
      const itemName = `Простой элемент ${Date.now()}`;
      const params = {
        action: 'createItem',
        boardId: boardId,
        itemName: itemName,
        columnValues: columnValues
      };
      
      if (groupId) {
        params.groupId = groupId;
      }
      
      this.log(`   Упрощенные column values: ${JSON.stringify(columnValues, null, 2)}`);
      
      const result = await this.mondayTool._call(params);
      
      const data = JSON.parse(result);
      if (data.success && data.data) {
        this.log(`✅ Упрощенный элемент создан: ${data.data.name} (ID: ${data.data.id})`, 'success');
      } else {
        this.log(`❌ Даже упрощенный вариант не работает: ${JSON.stringify(data)}`, 'error');
      }
    } catch (error) {
      this.log(`❌ Ошибка упрощенного создания: ${error.message}`, 'error');
    }
  }

  async testGetItems(boardId) {
    this.log(`Тест 5: Получение элементов доски ${boardId}...`);
    
    try {
      const result = await this.mondayTool._call({
        action: 'getItems',
        boardId: boardId,
        limit: 5,
        columnValues: true
      });
      
      const data = JSON.parse(result);
      if (data.success && data.data) {
        this.log(`✅ Получено элементов: ${data.data.length}`, 'success');
        data.data.forEach((item, index) => {
          this.log(`   ${index + 1}. ${item.name} (ID: ${item.id})`);
        });
      } else {
        this.log(`❌ Ошибка получения элементов: ${JSON.stringify(data)}`, 'error');
      }
    } catch (error) {
      this.log(`❌ Ошибка получения элементов: ${error.message}`, 'error');
    }
  }

  printSummary() {
    this.log('\n📊 Сводка результатов диагностики:');
    
    const successes = this.testResults.filter(r => r.type === 'success');
    const errors = this.testResults.filter(r => r.type === 'error');
    const warnings = this.testResults.filter(r => r.type === 'warning');
    
    this.log(`✅ Успешных операций: ${successes.length}`, 'success');
    this.log(`❌ Ошибок: ${errors.length}`, errors.length > 0 ? 'error' : 'success');
    this.log(`⚠️ Предупреждений: ${warnings.length}`, warnings.length > 0 ? 'warning' : 'success');
    
    if (errors.length > 0) {
      this.log('\n🔍 Список ошибок:');
      errors.forEach((error, index) => {
        this.log(`   ${index + 1}. ${error.message}`, 'error');
      });
    }
    
    // Сохраняем результаты в файл
    this.saveResults();
  }

  saveResults() {
    const fs = require('fs');
    const resultsFile = `monday_diagnostic_${Date.now()}.json`;
    
    try {
      fs.writeFileSync(resultsFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        results: this.testResults
      }, null, 2));
      
      this.log(`📁 Результаты сохранены в файл: ${resultsFile}`);
    } catch (error) {
      this.log(`❌ Не удалось сохранить результаты: ${error.message}`, 'error');
    }
  }
}

// Экспорт для использования в других скриптах
module.exports = { MondayDiagnostic };

// Запуск диагностики если скрипт выполняется напрямую
if (require.main === module) {
  const apiKey = process.env.MONDAY_API_KEY || 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';
  
  if (!apiKey) {
    console.error('❌ API ключ не найден');
    process.exit(1);
  }
  
  const diagnostic = new MondayDiagnostic(apiKey);
  
  diagnostic.runDiagnostic()
    .then(() => {
      console.log('\n🎯 Диагностика завершена успешно');
    })
    .catch(error => {
      console.error('\n💥 Диагностика провалена:', error.message);
      process.exit(1);
    });
} 