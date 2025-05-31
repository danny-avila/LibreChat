const MondayTool = require('./../../api/app/clients/tools/structured/MondayTool');

/**
 * ТЕСТИРОВАНИЕ ИСПРАВЛЕННЫХ КРИТИЧЕСКИХ ФУНКЦИЙ MONDAY.COM API
 * После исправления согласно официальной документации
 */
class FixedFunctionsTester {
  constructor(apiKey) {
    this.mondayTool = new MondayTool({ apiKey });
    this.testBoardId = '9261805849'; // Постоянная тестовая доска
    this.results = [];
    this.errors = [];
    
    console.log('🔧 ТЕСТИРОВАНИЕ ИСПРАВЛЕННЫХ КРИТИЧЕСКИХ ФУНКЦИЙ MONDAY API');
    console.log('=' .repeat(70));
  }

  async runTest(functionName, testData, description) {
    console.log(`\n🧪 Тестируем: ${functionName} - ${description}`);
    console.log('-'.repeat(50));
    
    try {
      const startTime = Date.now();
      const result = await this.mondayTool[functionName](testData);
      const duration = Date.now() - startTime;
      
      const parsedResult = JSON.parse(result);
      
      if (parsedResult.success) {
        console.log(`✅ ${functionName}: УСПЕШНО (${duration}ms)`);
        console.log(`   📊 Результат: ${JSON.stringify(parsedResult.data, null, 2).substring(0, 200)}...`);
        
        this.results.push({
          function: functionName,
          status: 'SUCCESS',
          duration,
          data: parsedResult.data
        });
        
        return parsedResult.data;
      } else {
        throw new Error('Function returned success: false');
      }
      
    } catch (error) {
      console.log(`❌ ${functionName}: ОШИБКА`);
      console.log(`   💥 Детали: ${error.message}`);
      
      this.errors.push({
        function: functionName,
        error: error.message,
        testData
      });
      
      this.results.push({
        function: functionName,
        status: 'ERROR',
        error: error.message
      });
      
      return null;
    }
  }

  async testFixedFunctions() {
    console.log('\n🔧 ФАЗА 1: ТЕСТИРОВАНИЕ ИСПРАВЛЕННЫХ КРИТИЧЕСКИХ ФУНКЦИЙ');
    console.log('=' .repeat(70));
    
    // 1. Тест getItems - ИСПРАВЛЕНА
    console.log('\n📝 1. ТЕСТИРУЕМ getItems (исправленная версия)');
    const items = await this.runTest('getItems', {
      boardId: this.testBoardId,
      limit: 5,
      columnValues: true
    }, 'Получение элементов доски с значениями колонок');

    // 2. Тест searchItems - ИСПРАВЛЕНА
    console.log('\n🔍 2. ТЕСТИРУЕМ searchItems (исправленная версия)');
    await this.runTest('searchItems', {
      boardId: this.testBoardId,
      query: 'test',
      limit: 3
    }, 'Поиск элементов на доске');

    // 3. Тест updateColumn - ИСПРАВЛЕНА
    if (items && items.length > 0) {
      console.log('\n📝 3. ТЕСТИРУЕМ updateColumn (исправленная версия)');
      const firstItem = items[0];
      
      // Найдем текстовую колонку для обновления
      const textColumn = firstItem.column_values?.find(col => 
        col.type === 'text' || col.type === 'long-text'
      );
      
      if (textColumn) {
        await this.runTest('updateColumn', {
          boardId: this.testBoardId,
          itemId: firstItem.id,
          columnId: textColumn.id,
          value: `Updated ${new Date().toISOString()}`
        }, `Обновление колонки ${textColumn.title}`);
      } else {
        console.log('⚠️ Не найдена подходящая колонка для обновления');
      }
    }

    // 4. Тест updateItem - ИСПРАВЛЕНА
    if (items && items.length > 0) {
      console.log('\n📝 4. ТЕСТИРУЕМ updateItem (исправленная версия)');
      const firstItem = items[0];
      
      // Найдем текстовую колонку для обновления
      const textColumn = firstItem.column_values?.find(col => 
        col.type === 'text' || col.type === 'long-text'
      );
      
      if (textColumn) {
        const columnValues = {};
        columnValues[textColumn.id] = `Batch update ${new Date().toISOString()}`;
        
        await this.runTest('updateItem', {
          boardId: this.testBoardId,
          itemId: firstItem.id,
          columnValues: columnValues
        }, 'Обновление нескольких колонок элемента');
      }
    }

    // 5. Тест createWebhook - ИСПРАВЛЕНА
    console.log('\n🔗 5. ТЕСТИРУЕМ createWebhook (исправленная версия)');
    const webhook = await this.runTest('createWebhook', {
      boardId: this.testBoardId,
      url: 'https://webhook-test.com/test-endpoint',
      event: 'create_item',
      config: null
    }, 'Создание webhook для события создания элемента');

    // 6. Удалим созданный webhook
    if (webhook && webhook.id) {
      console.log('\n🗑️ 6. ТЕСТИРУЕМ deleteWebhook');
      await this.runTest('deleteWebhook', {
        webhookId: webhook.id
      }, 'Удаление созданного webhook');
    }

    // Генерируем отчет
    this.generateReport();
  }

  generateReport() {
    console.log('\n');
    console.log('=' .repeat(70));
    console.log('📊 ИТОГОВЫЙ ОТЧЕТ О ТЕСТИРОВАНИИ ИСПРАВЛЕННЫХ ФУНКЦИЙ');
    console.log('=' .repeat(70));

    const successful = this.results.filter(r => r.status === 'SUCCESS').length;
    const failed = this.results.filter(r => r.status === 'ERROR').length;
    const total = this.results.length;

    console.log(`\n✅ УСПЕШНО: ${successful}/${total} (${Math.round(successful/total*100)}%)`);
    console.log(`❌ ОШИБКИ: ${failed}/${total} (${Math.round(failed/total*100)}%)`);

    if (this.errors.length > 0) {
      console.log('\n🚨 ОБНАРУЖЕННЫЕ ОШИБКИ:');
      this.errors.forEach((error, index) => {
        console.log(`\n${index + 1}. ${error.function}:`);
        console.log(`   💥 ${error.error}`);
      });
    }

    // Сохраняем детальный отчет
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: {
        total,
        successful,
        failed,
        successRate: Math.round(successful/total*100)
      },
      results: this.results,
      errors: this.errors
    };

    const fs = require('fs');
    const reportPath = `fixed_functions_report_${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
    
    console.log(`\n💾 Детальный отчет сохранен: ${reportPath}`);
    
    if (successful === total) {
      console.log('\n🎉 ВСЕ КРИТИЧЕСКИЕ ФУНКЦИИ РАБОТАЮТ КОРРЕКТНО!');
    } else {
      console.log(`\n⚠️ ТРЕБУЕТ ДОПОЛНИТЕЛЬНЫХ ИСПРАВЛЕНИЙ: ${failed} функций`);
    }
  }
}

// Запуск тестирования
async function main() {
  const apiKey = process.env.MONDAY_API_KEY;
  
  if (!apiKey) {
    console.error('❌ MONDAY_API_KEY не установлен!');
    console.log('Установите API ключ: export MONDAY_API_KEY="your_api_key"');
    process.exit(1);
  }

  const tester = new FixedFunctionsTester(apiKey);
  await tester.testFixedFunctions();
}

// Запускаем только если файл выполняется напрямую
if (require.main === module) {
  main().catch(console.error);
}

module.exports = FixedFunctionsTester; 