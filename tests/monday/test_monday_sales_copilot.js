#!/usr/bin/env node

/**
 * Расширенный тестовый скрипт для Monday.com Sales Copilot
 * Тестирует все критические функции для CRM/Sales интеграции
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

// Хелпер для красивого вывода
function log(level, message, details = '') {
  const levels = {
    info: `${colors.cyan}ℹ`,
    success: `${colors.green}✅`,
    error: `${colors.red}❌`,
    warning: `${colors.yellow}⚠️`,
    test: `${colors.blue}🧪`
  };
  
  console.log(`${levels[level]} ${message}${colors.reset}${details ? ': ' + details : ''}`);
}

async function testMondayAPISalesCopilot() {
  console.log(`${colors.bright}${colors.magenta}=== Monday.com Sales Copilot Test Suite ===${colors.reset}\n`);

  // Проверка API ключа
  const API_KEY = process.env.MONDAY_API_KEY || 'YOUR_API_KEY_HERE';
  const BOARD_ID = process.env.MONDAY_BOARD_ID || '4788479173';
  
  if (API_KEY === 'YOUR_API_KEY_HERE') {
    log('error', 'Установите MONDAY_API_KEY в переменных окружения');
    console.log('   Пример: MONDAY_API_KEY="ваш_токен" node test_monday_sales_copilot.js');
    process.exit(1);
  }

  const mondayTool = new MondayTool({ MONDAY_API_KEY: API_KEY });

  log('info', 'Проверка заголовка Authorization', `Bearer ${API_KEY.substring(0, 10)}...`);
  console.log();

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    critical_failed: []
  };

  // Критические тесты для Sales Copilot
  const tests = [
    {
      name: 'getUsers',
      description: 'Получение списка пользователей (команда продаж)',
      critical: true,
      test: async () => {
        const result = await mondayTool.getUsers({ limit: 5 });
        const data = JSON.parse(result);
        return { 
          success: data.success, 
          data: data.data,
          details: `Найдено ${data.data?.length || 0} пользователей`
        };
      }
    },
    {
      name: 'getBoards',
      description: 'Получение списка досок (CRM досок)',
      critical: true,
      test: async () => {
        const result = await mondayTool.getBoards({ limit: 5 });
        const data = JSON.parse(result);
        return { 
          success: data.success, 
          data: data.data,
          details: `Найдено ${data.data?.length || 0} досок`
        };
      }
    },
    {
      name: 'getBoard',
      description: 'Получение конкретной доски (основная CRM доска)',
      critical: true,
      test: async () => {
        const result = await mondayTool.getBoard({ 
          boardId: BOARD_ID,
          includeColumns: true,
          includeGroups: true
        });
        const data = JSON.parse(result);
        return { 
          success: data.success, 
          data: data.data,
          details: data.data?.name || 'Доска не найдена'
        };
      }
    },
    {
      name: 'getColumnsInfo',
      description: 'Получение информации о колонках (поля CRM)',
      critical: true,
      test: async () => {
        const result = await mondayTool.getColumnsInfo({ boardId: BOARD_ID });
        const data = JSON.parse(result);
        return { 
          success: data.success, 
          data: data.data,
          details: `Найдено ${data.data?.length || 0} колонок`
        };
      }
    },
    {
      name: 'createBoard',
      description: 'Создание новой доски',
      critical: false,
      test: async () => {
        const timestamp = Date.now();
        const result = await mondayTool.createBoard({ 
          boardName: `Test Sales Board ${timestamp}`,
          boardKind: 'public'
        });
        const data = JSON.parse(result);
        
        // Сохраняем ID для последующих тестов
        if (data.success && data.data?.id) {
          global.testBoardId = data.data.id;
        }
        
        return { 
          success: data.success, 
          data: data.data,
          details: data.data?.name || 'Ошибка создания'
        };
      }
    },
    {
      name: 'createItem',
      description: 'Создание элемента (новый лид/сделка)',
      critical: true,
      test: async () => {
        const boardIdToUse = global.testBoardId || BOARD_ID;
        const result = await mondayTool.createItem({ 
          boardId: boardIdToUse,
          itemName: 'Тестовый лид от Sales Copilot',
          columnValues: {
            status: 'New Lead',
            text: 'Автоматически созданный лид'
          }
        });
        const data = JSON.parse(result);
        
        // Сохраняем ID для последующих тестов
        if (data.success && data.data?.id) {
          global.testItemId = data.data.id;
        }
        
        return { 
          success: data.success, 
          data: data.data,
          details: data.data?.name || 'Ошибка создания'
        };
      }
    },
    {
      name: 'searchItems',
      description: 'Поиск элементов (поиск лидов/сделок)',
      critical: true,
      test: async () => {
        const boardIdToUse = global.testBoardId || BOARD_ID;
        const result = await mondayTool.searchItems({ 
          boardId: boardIdToUse,
          query: 'test',
          limit: 5
        });
        const data = JSON.parse(result);
        return { 
          success: data.success, 
          data: data.data,
          details: `Найдено ${data.data?.length || 0} элементов`
        };
      }
    },
    {
      name: 'createUpdate',
      description: 'Добавление комментария/активности',
      critical: false,
      test: async () => {
        if (!global.testItemId) {
          return { success: false, error: 'Нет тестового элемента' };
        }
        
        const result = await mondayTool.createUpdate({ 
          itemId: global.testItemId,
          body: 'Автоматическая заметка от Sales Copilot'
        });
        const data = JSON.parse(result);
        return { 
          success: data.success, 
          data: data.data,
          details: 'Комментарий добавлен'
        };
      }
    },
    {
      name: 'createTeam',
      description: 'Создание команды продаж',
      critical: false,
      test: async () => {
        const timestamp = Date.now();
        const result = await mondayTool.createTeam({ 
          teamName: `Sales Team ${timestamp}`,
          description: 'Тестовая команда продаж'
        });
        const data = JSON.parse(result);
        return { 
          success: data.success, 
          data: data.data,
          details: data.data?.name || 'Ошибка создания'
        };
      }
    },
    {
      name: 'createWebhook',
      description: 'Создание webhook для автоматизации',
      critical: false,
      test: async () => {
        const boardIdToUse = global.testBoardId || BOARD_ID;
        const result = await mondayTool.createWebhook({ 
          boardId: boardIdToUse,
          url: 'https://example.com/webhook',
          event: 'create_item'
        });
        const data = JSON.parse(result);
        return { 
          success: data.success, 
          data: data.data,
          details: 'Webhook создан'
        };
      }
    },
    {
      name: 'getWorkspaces',
      description: 'Получение рабочих пространств',
      critical: false,
      test: async () => {
        const result = await mondayTool.getWorkspaces({ limit: 5 });
        const data = JSON.parse(result);
        return { 
          success: data.success, 
          data: data.data,
          details: `Найдено ${data.data?.length || 0} workspace`
        };
      }
    }
  ];

  // Выполнение тестов
  for (const test of tests) {
    results.total++;
    
    log('test', `Тест: ${test.description}`);
    console.log(`   Action: ${test.name}`);
    
    try {
      const testResult = await test.test();
      
      if (testResult.success) {
        log('success', 'Успешно', testResult.details);
        results.passed++;
      } else {
        log('error', 'Неудачно', testResult.error || 'Неизвестная ошибка');
        results.failed++;
        if (test.critical) {
          results.critical_failed.push(test.name);
        }
      }
    } catch (error) {
      log('error', 'Ошибка', error.message);
      results.failed++;
      if (test.critical) {
        results.critical_failed.push(test.name);
      }
    }
    console.log();
  }

  // Итоговая статистика
  console.log(`${colors.bright}${colors.magenta}=== Результаты тестирования ===${colors.reset}`);
  console.log(`${colors.green}✅ Успешных тестов: ${results.passed}/${results.total}${colors.reset}`);
  console.log(`${colors.red}❌ Неудачных тестов: ${results.failed}/${results.total}${colors.reset}`);
  
  if (results.critical_failed.length > 0) {
    console.log(`\n${colors.bright}${colors.red}⚠️  КРИТИЧЕСКИЕ СБОИ:${colors.reset}`);
    results.critical_failed.forEach(name => {
      console.log(`   - ${name}`);
    });
    console.log(`\n${colors.yellow}Sales Copilot не может работать без этих функций!${colors.reset}`);
  } else if (results.failed === 0) {
    console.log(`\n${colors.bright}${colors.green}🎉 Все тесты пройдены! Monday.com готов для Sales Copilot.${colors.reset}`);
  } else {
    console.log(`\n${colors.bright}${colors.yellow}⚠️  Некоторые некритические функции не работают.${colors.reset}`);
    console.log(`${colors.green}✅ Sales Copilot может работать с базовой функциональностью.${colors.reset}`);
  }

  // Очистка тестовых данных
  if (global.testItemId) {
    try {
      await mondayTool.deleteItem({ itemId: global.testItemId });
      log('info', 'Тестовый элемент удален');
    } catch (e) {}
  }
}

// Запуск тестов
testMondayAPISalesCopilot().catch(error => {
  console.error(`${colors.red}Критическая ошибка:`, error);
  process.exit(1);
}); 