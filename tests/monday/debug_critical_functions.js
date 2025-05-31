const MondayTool = require('./../../api/app/clients/tools/structured/MondayTool');

/**
 * ДИАГНОСТИКА КРИТИЧЕСКИХ ФУНКЦИЙ MONDAY.COM API
 * Фокус на самых важных и проблемных функциях
 */
class CriticalFunctionsTester {
  constructor(apiKey) {
    this.mondayTool = new MondayTool({ apiKey });
    this.testBoardId = '9261805849'; // Постоянная тестовая доска
    this.results = [];
    this.criticalIssues = [];
    
    // Самые критичные функции, которые должны работать
    this.criticalFunctions = [
      'getBoards',      // Основа работы - получение досок
      'getBoard',       // Получение информации о доске
      'getItems',       // ПРОБЛЕМА - получение элементов
      'createItem',     // Создание элементов
      'updateItem',     // ПРОБЛЕМА - обновление элементов  
      'searchItems',    // ПРОБЛЕМА - поиск элементов
      'getColumnsInfo', // Получение информации о колонках
      'updateColumn',   // ПРОБЛЕМА - обновление колонок
      'createWebhook',  // ПРОБЛЕМА - создание вебхуков
      'getWorkspaces',  // Получение рабочих пространств
    ];
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const emoji = {
      'info': '📋',
      'success': '✅',
      'error': '❌',
      'warning': '⚠️',
      'debug': '🔍'
    }[level] || '📋';
    
    console.log(`${emoji} ${message}`);
    this.results.push({ timestamp, level, message });
  }

  async runCriticalTest() {
    this.log('🚀 ЗАПУСК ДИАГНОСТИКИ КРИТИЧЕСКИХ ФУНКЦИЙ', 'info');
    this.log(`📋 Тестовая доска: ${this.testBoardId}`, 'info');
    console.log('');

    for (const functionName of this.criticalFunctions) {
      await this.testCriticalFunction(functionName);
    }

    this.printCriticalSummary();
  }

  async testCriticalFunction(functionName) {
    this.log(`\n🔍 ДЕТАЛЬНЫЙ ТЕСТ: ${functionName}`, 'debug');
    
    try {
      let result;
      let testData = {};
      
      switch (functionName) {
        case 'getBoards':
          testData = { action: 'getBoards', limit: 5 };
          break;
          
        case 'getBoard':
          testData = { 
            action: 'getBoard', 
            boardId: this.testBoardId,
            includeItems: true,
            includeGroups: true,
            includeColumns: true
          };
          break;
          
        case 'getItems':
          testData = { 
            action: 'getItems', 
            boardId: this.testBoardId,
            limit: 10,
            columnValues: true
          };
          break;
          
        case 'createItem':
          testData = {
            action: 'createItem',
            boardId: this.testBoardId,
            itemName: `Debug Test ${Date.now()}`
          };
          break;
          
        case 'updateItem':
          // Сначала создаем элемент для обновления
          const createResult = await this.mondayTool._call({
            action: 'createItem',
            boardId: this.testBoardId,
            itemName: `Item for Update ${Date.now()}`
          });
          
          const createData = JSON.parse(createResult);
          if (createData.success && createData.data) {
            testData = {
              action: 'updateItem',
              itemId: createData.data.id,
              itemName: `Updated ${Date.now()}`
            };
          } else {
            throw new Error('Failed to create item for update test');
          }
          break;
          
        case 'searchItems':
          testData = {
            action: 'searchItems',
            boardId: this.testBoardId,
            query: 'test'
          };
          break;
          
        case 'getColumnsInfo':
          testData = {
            action: 'getColumnsInfo',
            boardId: this.testBoardId
          };
          break;
          
        case 'updateColumn':
          // Получаем колонки сначала
          const columnsResult = await this.mondayTool._call({
            action: 'getColumnsInfo',
            boardId: this.testBoardId
          });
          
          const columnsData = JSON.parse(columnsResult);
          if (columnsData.success && columnsData.data && columnsData.data.length > 0) {
            const textColumn = columnsData.data.find(c => c.type === 'text');
            if (textColumn) {
              testData = {
                action: 'updateColumn',
                columnId: textColumn.id,
                title: `Updated ${Date.now()}`
              };
            } else {
              throw new Error('No text column found for update test');
            }
          } else {
            throw new Error('Failed to get columns for update test');
          }
          break;
          
        case 'createWebhook':
          testData = {
            action: 'createWebhook',
            boardId: this.testBoardId,
            url: 'https://httpbin.org/post',
            event: 'create_item'
          };
          break;
          
        case 'getWorkspaces':
          testData = { action: 'getWorkspaces', limit: 5 };
          break;
          
        default:
          this.log(`Неизвестная функция: ${functionName}`, 'warning');
          return;
      }
      
      this.log(`📤 Запрос: ${JSON.stringify(testData, null, 2)}`, 'debug');
      
      result = await this.mondayTool._call(testData);
      
      this.log(`📥 Ответ: ${result}`, 'debug');
      
      const data = JSON.parse(result);
      if (data.success) {
        this.log(`✅ ${functionName}: РАБОТАЕТ`, 'success');
        if (data.data) {
          if (Array.isArray(data.data)) {
            this.log(`   Получено записей: ${data.data.length}`, 'info');
          } else if (data.data.id) {
            this.log(`   ID результата: ${data.data.id}`, 'info');
          }
        }
      } else {
        this.log(`❌ ${functionName}: ОШИБКА - ${data.error || 'Unknown error'}`, 'error');
        this.criticalIssues.push({
          function: functionName,
          error: data.error || 'Unknown error',
          request: testData,
          response: data
        });
      }
      
    } catch (error) {
      this.log(`❌ ${functionName}: КРИТИЧЕСКАЯ ОШИБКА - ${error.message}`, 'error');
      this.criticalIssues.push({
        function: functionName,
        error: error.message,
        stack: error.stack
      });
    }
  }

  printCriticalSummary() {
    console.log('\n' + '='.repeat(80));
    this.log('📊 СВОДКА КРИТИЧЕСКИХ ФУНКЦИЙ', 'info');
    console.log('='.repeat(80));
    
    const successes = this.results.filter(r => r.level === 'success');
    const errors = this.results.filter(r => r.level === 'error');
    
    this.log(`✅ Рабочих функций: ${successes.length}/${this.criticalFunctions.length}`, 'success');
    this.log(`❌ Проблемных функций: ${errors.length}/${this.criticalFunctions.length}`, 'error');
    
    if (this.criticalIssues.length > 0) {
      console.log('\n🚨 КРИТИЧЕСКИЕ ПРОБЛЕМЫ:');
      this.criticalIssues.forEach((issue, index) => {
        console.log(`\n${index + 1}. ФУНКЦИЯ: ${issue.function}`);
        console.log(`   ОШИБКА: ${issue.error}`);
        if (issue.request) {
          console.log(`   ЗАПРОС: ${JSON.stringify(issue.request, null, 2)}`);
        }
        if (issue.response) {
          console.log(`   ОТВЕТ: ${JSON.stringify(issue.response, null, 2)}`);
        }
      });
    }
    
    // Оценка критичности
    const criticalityScore = (successes.length / this.criticalFunctions.length) * 100;
    console.log(`\n🎯 ОЦЕНКА КРИТИЧНОСТИ: ${criticalityScore.toFixed(1)}%`);
    
    if (criticalityScore >= 80) {
      console.log('✅ СТАТУС: API готов к продакшену');
    } else if (criticalityScore >= 60) {
      console.log('⚠️ СТАТУС: Есть важные проблемы, требует исправления');
    } else {
      console.log('❌ СТАТУС: Критические проблемы, не готов к использованию');
    }
    
    this.saveDetailedReport();
  }

  saveDetailedReport() {
    const fs = require('fs');
    const reportFile = `monday_critical_report_${Date.now()}.json`;
    
    const report = {
      timestamp: new Date().toISOString(),
      totalFunctions: this.criticalFunctions.length,
      successCount: this.results.filter(r => r.level === 'success').length,
      errorCount: this.results.filter(r => r.level === 'error').length,
      criticalIssues: this.criticalIssues,
      allResults: this.results
    };
    
    try {
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
      this.log(`📁 Детальный отчет сохранен: ${reportFile}`, 'info');
    } catch (error) {
      this.log(`❌ Ошибка сохранения отчета: ${error.message}`, 'error');
    }
  }
}

// Запуск если вызывается напрямую
if (require.main === module) {
  const apiKey = process.env.MONDAY_API_KEY;
  
  if (!apiKey) {
    console.error('❌ MONDAY_API_KEY не установлен');
    process.exit(1);
  }
  
  const tester = new CriticalFunctionsTester(apiKey);
  
  tester.runCriticalTest()
    .then(() => {
      console.log('\n🎯 Диагностика критических функций завершена');
    })
    .catch(error => {
      console.error('\n💥 Ошибка диагностики:', error.message);
      process.exit(1);
    });
}

module.exports = { CriticalFunctionsTester }; 