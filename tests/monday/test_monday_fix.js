#!/usr/bin/env node

/**
 * Тестовый скрипт для проверки исправления Monday.com API
 * Этот скрипт тестирует различные API запросы с правильным заголовком Authorization
 */

const MondayTool = require('./AI-experts-OS/api/app/clients/tools/structured/MondayTool');

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

async function testMondayAPI() {
  console.log(`${colors.bright}${colors.blue}=== Monday.com API Fix Test ===${colors.reset}\n`);

  // Замените этот токен на ваш реальный API токен
  const API_KEY = process.env.MONDAY_API_KEY || 'YOUR_API_KEY_HERE';
  
  if (API_KEY === 'YOUR_API_KEY_HERE') {
    console.log(`${colors.red}❌ Ошибка: Установите MONDAY_API_KEY в переменных окружения или замените в коде${colors.reset}`);
    console.log('   Пример: MONDAY_API_KEY="ваш_токен" node test_monday_fix.js');
    process.exit(1);
  }

  const mondayTool = new MondayTool({ MONDAY_API_KEY: API_KEY });

  console.log(`${colors.cyan}📋 Проверка заголовка Authorization...${colors.reset}`);
  console.log(`   Authorization: Bearer ${API_KEY.substring(0, 10)}...`);
  console.log();

  // Тестовые случаи
  const tests = [
    {
      name: 'getBoards',
      action: async () => await mondayTool.getBoards({ limit: 5 }),
      description: 'Получение списка досок'
    },
    {
      name: 'getWorkspaces',
      action: async () => await mondayTool.getWorkspaces({ limit: 5 }),
      description: 'Получение списка workspace'
    },
    {
      name: 'getAccount',
      action: async () => await mondayTool.getAccount(),
      description: 'Получение информации об аккаунте'
    },
    {
      name: 'getUsers',
      action: async () => await mondayTool.getUsers({ limit: 5 }),
      description: 'Получение списка пользователей'
    }
  ];

  let successCount = 0;
  let failCount = 0;

  for (const test of tests) {
    console.log(`${colors.bright}🧪 Тест: ${test.description}${colors.reset}`);
    console.log(`   Action: ${test.name}`);
    
    try {
      const result = await test.action();
      const data = JSON.parse(result);
      
      if (data.success) {
        console.log(`   ${colors.green}✅ Успешно!${colors.reset}`);
        console.log(`   Данные: ${JSON.stringify(data.data).substring(0, 100)}...`);
        successCount++;
      } else {
        console.log(`   ${colors.red}❌ Неудачно: ${data.error}${colors.reset}`);
        failCount++;
      }
    } catch (error) {
      console.log(`   ${colors.red}❌ Ошибка: ${error.message}${colors.reset}`);
      failCount++;
    }
    console.log();
  }

  // Дополнительный тест с конкретной доской (если у вас есть ID доски)
  const boardId = process.env.MONDAY_BOARD_ID;
  if (boardId) {
    console.log(`${colors.bright}🧪 Тест: Получение доски ${boardId}${colors.reset}`);
    try {
      const result = await mondayTool.getBoard({ 
        boardId, 
        includeItems: true,
        includeGroups: true,
        includeColumns: true
      });
      const data = JSON.parse(result);
      
      if (data.success) {
        console.log(`   ${colors.green}✅ Успешно!${colors.reset}`);
        console.log(`   Название доски: ${data.data.name}`);
        successCount++;
      } else {
        console.log(`   ${colors.red}❌ Неудачно: ${data.error}${colors.reset}`);
        failCount++;
      }
    } catch (error) {
      console.log(`   ${colors.red}❌ Ошибка: ${error.message}${colors.reset}`);
      failCount++;
    }
    console.log();
  }

  // Итоговая статистика
  console.log(`${colors.bright}${colors.magenta}=== Результаты ===${colors.reset}`);
  console.log(`${colors.green}✅ Успешных тестов: ${successCount}${colors.reset}`);
  console.log(`${colors.red}❌ Неудачных тестов: ${failCount}${colors.reset}`);
  
  if (failCount === 0) {
    console.log(`\n${colors.bright}${colors.green}🎉 Все тесты пройдены успешно! API исправлен и работает корректно.${colors.reset}`);
  } else {
    console.log(`\n${colors.bright}${colors.yellow}⚠️  Некоторые тесты не прошли. Проверьте токен и права доступа.${colors.reset}`);
  }
}

// Запуск тестов
testMondayAPI().catch(error => {
  console.error(`${colors.red}Критическая ошибка:`, error);
  process.exit(1);
}); 