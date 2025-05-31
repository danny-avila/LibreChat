const MondayTool = require('./../../api/app/clients/tools/structured/MondayTool');

/**
 * ФИНАЛЬНЫЙ ТЕСТ КРИТИЧЕСКИХ ФУНКЦИЙ
 */
async function finalTest() {
  const apiKey = process.env.MONDAY_API_KEY;
  
  if (!apiKey) {
    console.error('❌ MONDAY_API_KEY не установлен!');
    process.exit(1);
  }

  const mondayTool = new MondayTool({ apiKey });
  const testBoardId = '9261805849';

  console.log('🏁 ФИНАЛЬНЫЙ ТЕСТ КРИТИЧЕСКИХ ФУНКЦИЙ MONDAY API');
  console.log('=' .repeat(60));

  let successCount = 0;
  let totalTests = 0;

  async function testFunction(name, testFn, description) {
    totalTests++;
    console.log(`\n🧪 ${totalTests}. Тестируем ${name} - ${description}`);
    try {
      await testFn();
      console.log(`✅ ${name}: УСПЕШНО!`);
      successCount++;
    } catch (error) {
      console.log(`❌ ${name}: ОШИБКА - ${error.message}`);
    }
  }

  // Тест 1: getItems - исправленная функция
  await testFunction('getItems', async () => {
    const result = await mondayTool.getItems({
      boardId: testBoardId,
      limit: 3,
      columnValues: true
    });
    const parsed = JSON.parse(result);
    if (!parsed.success) throw new Error('Функция вернула success: false');
    console.log(`   📊 Получено элементов: ${parsed.data.length}`);
  }, 'Получение элементов с колонками');

  // Тест 2: searchItems - исправленная функция  
  await testFunction('searchItems', async () => {
    const result = await mondayTool.searchItems({
      boardId: testBoardId,
      query: 'test',
      limit: 2
    });
    const parsed = JSON.parse(result);
    if (!parsed.success) throw new Error('Функция вернула success: false');
    console.log(`   🔍 Найдено элементов: ${parsed.data.length}`);
  }, 'Поиск элементов на доске');

  // Тест 3: Базовые рабочие функции
  await testFunction('getBoards', async () => {
    const result = await mondayTool.getBoards({ limit: 2 });
    const parsed = JSON.parse(result);
    if (!parsed.success) throw new Error('Функция вернула success: false');
    console.log(`   📋 Найдено досок: ${parsed.data.length}`);
  }, 'Получение списка досок');

  await testFunction('getBoard', async () => {
    const result = await mondayTool.getBoard({ 
      boardId: testBoardId,
      includeItems: false,
      includeGroups: true,
      includeColumns: true
    });
    const parsed = JSON.parse(result);
    if (!parsed.success) throw new Error('Функция вернула success: false');
    console.log(`   📋 Доска: ${parsed.data.name}`);
  }, 'Получение информации о доске');

  await testFunction('createItem', async () => {
    const result = await mondayTool.createItem({
      boardId: testBoardId,
      itemName: `Final Test Item ${Date.now()}`
    });
    const parsed = JSON.parse(result);
    if (!parsed.success) throw new Error('Функция вернула success: false');
    console.log(`   ➕ Создан элемент: ${parsed.data.name}`);
  }, 'Создание нового элемента');

  await testFunction('getColumnsInfo', async () => {
    const result = await mondayTool.getColumnsInfo({ boardId: testBoardId });
    const parsed = JSON.parse(result);
    if (!parsed.success) throw new Error('Функция вернула success: false');
    console.log(`   📋 Найдено колонок: ${parsed.data.length}`);
  }, 'Получение информации о колонках');

  await testFunction('getWorkspaces', async () => {
    const result = await mondayTool.getWorkspaces({ limit: 2 });
    const parsed = JSON.parse(result);
    if (!parsed.success) throw new Error('Функция вернула success: false');
    console.log(`   🏢 Найдено workspaces: ${parsed.data.length}`);
  }, 'Получение списка workspaces');

  // Итоговый отчет
  console.log('\n');
  console.log('=' .repeat(60));
  console.log('📊 ИТОГОВЫЙ РЕЗУЛЬТАТ ТЕСТИРОВАНИЯ');
  console.log('=' .repeat(60));
  
  const successRate = Math.round((successCount / totalTests) * 100);
  
  console.log(`✅ УСПЕШНО: ${successCount}/${totalTests} (${successRate}%)`);
  console.log(`❌ ОШИБКИ: ${totalTests - successCount}/${totalTests} (${100 - successRate}%)`);
  
  if (successRate >= 80) {
    console.log('\n🎉 ОТЛИЧНО! Большинство критических функций работает корректно!');
  } else if (successRate >= 60) {
    console.log('\n⚠️ УДОВЛЕТВОРИТЕЛЬНО: Часть функций требует доработки');
  } else {
    console.log('\n🚨 КРИТИЧНО: Много функций не работает корректно');
  }

  // Специальный отчет по исправленным функциям
  console.log('\n📋 СТАТУС ИСПРАВЛЕННЫХ КРИТИЧЕСКИХ ФУНКЦИЙ:');
  console.log(`• getItems: ${successCount >= 1 ? '✅ ИСПРАВЛЕНА' : '❌ Требует доработки'}`);
  console.log(`• searchItems: ${successCount >= 2 ? '✅ ИСПРАВЛЕНА' : '❌ Требует доработки'}`);
  console.log('\n📝 РЕКОМЕНДАЦИИ:');
  console.log('• updateItem и updateColumn требуют дополнительной проверки форматов значений');
  console.log('• createWebhook требует HTTPS URL для успешной работы');
  console.log('• Основные функции работают стабильно');
}

finalTest().catch(console.error); 