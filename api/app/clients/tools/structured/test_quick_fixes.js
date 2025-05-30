const MondayTool = require('./MondayTool');

/**
 * Быстрый тест исправлений Monday.com API
 * Проверяем основные исправленные функции
 */
async function testQuickFixes() {
  const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';
  const mondayTool = new MondayTool({ apiKey });
  const testBoardId = '9261805849';

  console.log('🔧 Тестируем основные исправления...\n');

  // Тест 1: createTeam (исправили description)
  console.log('1. Тестируем createTeam без description:');
  try {
    const result = await mondayTool._call({
      action: 'createTeam',
      teamName: `Quick Test Team ${Date.now()}`
    });
    const parsed = JSON.parse(result);
    if (parsed.success) {
      console.log('✅ createTeam: РАБОТАЕТ');
    } else {
      console.log('❌ createTeam: ОШИБКА -', parsed.error);
    }
  } catch (error) {
    console.log('❌ createTeam: ИСКЛЮЧЕНИЕ -', error.message);
  }

  // Тест 2: createBoard (проверяем что есть)
  console.log('\n2. Тестируем createBoard:');
  try {
    const result = await mondayTool._call({
      action: 'createBoard',
      boardName: `Quick Test Board ${Date.now()}`,
      boardKind: 'public'
    });
    const parsed = JSON.parse(result);
    if (parsed.success) {
      console.log('✅ createBoard: РАБОТАЕТ');
    } else {
      console.log('❌ createBoard: ОШИБКА -', parsed.error);
    }
  } catch (error) {
    console.log('❌ createBoard: ИСКЛЮЧЕНИЕ -', error.message);
  }

  // Тест 3: createWorkspace (проверяем новый метод)
  console.log('\n3. Тестируем createWorkspace (новый метод):');
  try {
    const result = await mondayTool._call({
      action: 'createWorkspace',
      workspaceName: `Quick Test Workspace ${Date.now()}`,
      workspaceKind: 'open'
    });
    const parsed = JSON.parse(result);
    if (parsed.success) {
      console.log('✅ createWorkspace: РАБОТАЕТ');
    } else {
      console.log('❌ createWorkspace: ОШИБКА -', parsed.error);
    }
  } catch (error) {
    console.log('❌ createWorkspace: ИСКЛЮЧЕНИЕ -', error.message);
  }

  // Тест 4: getAssets (проверяем новый метод)
  console.log('\n4. Тестируем getAssets (новый метод):');
  try {
    const result = await mondayTool._call({
      action: 'getAssets',
      limit: 5
    });
    const parsed = JSON.parse(result);
    if (parsed.success) {
      console.log('✅ getAssets: РАБОТАЕТ');
    } else {
      console.log('❌ getAssets: ОШИБКА -', parsed.error);
    }
  } catch (error) {
    console.log('❌ getAssets: ИСКЛЮЧЕНИЕ -', error.message);
  }

  // Тест 5: createColumn (проверяем новый метод)
  console.log('\n5. Тестируем createColumn (новый метод):');
  try {
    const result = await mondayTool._call({
      action: 'createColumn',
      boardId: testBoardId,
      title: `Quick Test Column ${Date.now()}`,
      columnType: 'text'
    });
    const parsed = JSON.parse(result);
    if (parsed.success) {
      console.log('✅ createColumn: РАБОТАЕТ');
    } else {
      console.log('❌ createColumn: ОШИБКА -', parsed.error);
    }
  } catch (error) {
    console.log('❌ createColumn: ИСКЛЮЧЕНИЕ -', error.message);
  }

  console.log('\n🏁 Быстрый тест завершен!');
}

testQuickFixes().catch(console.error); 