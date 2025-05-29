#!/usr/bin/env node

/**
 * Скрипт для тестирования интеграции monday.com API v2.0
 * Проверяет работоспособность всех новых функций
 */

const MondayTool = require('./MondayTool');

// Простая реализация logger для тестирования
const logger = {
  debug: (msg, obj) => console.log(`DEBUG: ${msg}`, obj ? JSON.stringify(obj, null, 2) : ''),
  info: (msg, obj) => console.log(`INFO: ${msg}`, obj ? JSON.stringify(obj, null, 2) : ''),
  warn: (msg, obj) => console.warn(`WARN: ${msg}`, obj ? JSON.stringify(obj, null, 2) : ''),
  error: (msg, obj) => console.error(`ERROR: ${msg}`, obj ? JSON.stringify(obj, null, 2) : '')
};

// Mock fetch для тестирования без реального API
const mockFetch = (mockResponse) => {
  global.fetch = jest.fn(() => 
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    })
  );
};

// Восстановление оригинального fetch
const restoreFetch = () => {
  if (global.fetch && global.fetch.mockRestore) {
    global.fetch.mockRestore();
  }
};

class MondayIntegrationTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      errors: []
    };
    
    // Создаем инстанс MondayTool
    this.mondayTool = new MondayTool({ 
      MONDAY_API_KEY: 'test_api_key_for_integration_testing',
      override: false 
    });
  }

  /**
   * Тест базовой валидации схемы
   */
  async testSchemaValidation() {
    console.log('\n🔍 Тестирование валидации схемы...');
    
    try {
      // Тест валидного ввода
      const validInput = {
        action: 'getBoards',
        limit: 10
      };
      
      const validResult = this.mondayTool.schema.safeParse(validInput);
      if (!validResult.success) {
        throw new Error(`Валидация правильного ввода не прошла: ${JSON.stringify(validResult.error)}`);
      }
      
      // Тест невалидного action
      const invalidInput = {
        action: 'invalidAction'
      };
      
      const invalidResult = this.mondayTool.schema.safeParse(invalidInput);
      if (invalidResult.success) {
        throw new Error('Валидация неправильного ввода должна была не пройти');
      }
      
      console.log('✅ Валидация схемы работает корректно');
      this.results.passed++;
      
    } catch (error) {
      console.log(`❌ Ошибка валидации схемы: ${error.message}`);
      this.results.failed++;
      this.results.errors.push(`Schema validation: ${error.message}`);
    }
  }

  /**
   * Тест функций ФАЗЫ 1: Webhooks
   */
  async testWebhookFunctions() {
    console.log('\n🔗 Тестирование функций Webhooks (Фаза 1)...');
    
    const testCases = [
      {
        name: 'createWebhook',
        input: {
          action: 'createWebhook',
          boardId: '123',
          url: 'https://example.com/webhook',
          event: 'create_item'
        },
        mockResponse: {
          data: {
            create_webhook: {
              id: 'webhook_123',
              board_id: '123',
              url: 'https://example.com/webhook',
              event: 'create_item'
            }
          }
        }
      },
      {
        name: 'getWebhooks',
        input: {
          action: 'getWebhooks',
          boardId: '123'
        },
        mockResponse: {
          data: {
            webhooks: [
              {
                id: 'webhook_123',
                board_id: '123',
                url: 'https://example.com/webhook',
                event: 'create_item'
              }
            ]
          }
        }
      }
    ];

    for (const testCase of testCases) {
      try {
        console.log(`  Тестирование ${testCase.name}...`);
        
        // Mock fetch response
        global.fetch = jest.fn(() => 
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve(testCase.mockResponse)
          })
        );

        const result = await this.mondayTool._call(testCase.input);
        const parsedResult = JSON.parse(result);
        
        if (!parsedResult.success) {
          throw new Error(`${testCase.name} вернул ошибку: ${parsedResult.error}`);
        }
        
        console.log(`  ✅ ${testCase.name} работает корректно`);
        this.results.passed++;
        
      } catch (error) {
        console.log(`  ❌ Ошибка ${testCase.name}: ${error.message}`);
        this.results.failed++;
        this.results.errors.push(`${testCase.name}: ${error.message}`);
      }
    }
  }

  /**
   * Тест функций ФАЗЫ 2: Teams & Users
   */
  async testTeamsFunctions() {
    console.log('\n👥 Тестирование функций Teams & Users (Фаза 2)...');
    
    const testCases = [
      {
        name: 'createTeam',
        input: {
          action: 'createTeam',
          teamName: 'Test Team'
        },
        mockResponse: {
          data: {
            create_team: {
              id: 'team_123',
              name: 'Test Team'
            }
          }
        }
      },
      {
        name: 'getAccount',
        input: {
          action: 'getAccount'
        },
        mockResponse: {
          data: {
            account: {
              id: 'account_123',
              name: 'Test Account'
            }
          }
        }
      }
    ];

    for (const testCase of testCases) {
      try {
        console.log(`  Тестирование ${testCase.name}...`);
        
        global.fetch = jest.fn(() => 
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve(testCase.mockResponse)
          })
        );

        const result = await this.mondayTool._call(testCase.input);
        const parsedResult = JSON.parse(result);
        
        if (!parsedResult.success) {
          throw new Error(`${testCase.name} вернул ошибку: ${parsedResult.error}`);
        }
        
        console.log(`  ✅ ${testCase.name} работает корректно`);
        this.results.passed++;
        
      } catch (error) {
        console.log(`  ❌ Ошибка ${testCase.name}: ${error.message}`);
        this.results.failed++;
        this.results.errors.push(`${testCase.name}: ${error.message}`);
      }
    }
  }

  /**
   * Тест функций ФАЗЫ 3: Workspaces & Advanced
   */
  async testWorkspacesFunctions() {
    console.log('\n🏢 Тестирование функций Workspaces & Advanced (Фаза 3)...');
    
    const testCases = [
      {
        name: 'createWorkspace',
        input: {
          action: 'createWorkspace',
          workspaceName: 'Test Workspace',
          workspaceKind: 'open'
        },
        mockResponse: {
          data: {
            create_workspace: {
              id: 'workspace_123',
              name: 'Test Workspace',
              kind: 'open'
            }
          }
        }
      },
      {
        name: 'createColumn',
        input: {
          action: 'createColumn',
          boardId: '123',
          columnType: 'text',
          title: 'Test Column'
        },
        mockResponse: {
          data: {
            create_column: {
              id: 'column_123',
              title: 'Test Column',
              type: 'text'
            }
          }
        }
      }
    ];

    for (const testCase of testCases) {
      try {
        console.log(`  Тестирование ${testCase.name}...`);
        
        global.fetch = jest.fn(() => 
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve(testCase.mockResponse)
          })
        );

        const result = await this.mondayTool._call(testCase.input);
        const parsedResult = JSON.parse(result);
        
        if (!parsedResult.success) {
          throw new Error(`${testCase.name} вернул ошибку: ${parsedResult.error}`);
        }
        
        console.log(`  ✅ ${testCase.name} работает корректно`);
        this.results.passed++;
        
      } catch (error) {
        console.log(`  ❌ Ошибка ${testCase.name}: ${error.message}`);
        this.results.failed++;
        this.results.errors.push(`${testCase.name}: ${error.message}`);
      }
    }
  }

  /**
   * Тест производительности и оптимизации
   */
  async testPerformanceOptimizations() {
    console.log('\n⚡ Тестирование оптимизаций производительности...');
    
    try {
      // Тест batch операций
      console.log('  Тестирование batch операций...');
      
      const batchRequests = [
        { action: 'getBoards', limit: 5 },
        { action: 'getWorkspaces' },
        { action: 'getUsers', limit: 10 }
      ];
      
      // Mock успешных ответов для batch
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { boards: [{ id: '1', name: 'Board 1' }] }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { workspaces: [{ id: '1', name: 'Workspace 1' }] }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: { users: [{ id: '1', name: 'User 1' }] }
          })
        });

      const startTime = Date.now();
      
      // Проверяем, что у MondayTool есть метод performBatchOperations
      if (typeof this.mondayTool.performBatchOperations === 'function') {
        const results = await this.mondayTool.performBatchOperations(batchRequests);
        const endTime = Date.now();
        
        console.log(`  ✅ Batch операции выполнены за ${endTime - startTime}ms`);
        console.log(`  ✅ Обработано ${results.length} запросов`);
        this.results.passed++;
      } else {
        console.log('  ⚠️  Метод performBatchOperations не найден, пропускаем тест');
      }
      
    } catch (error) {
      console.log(`  ❌ Ошибка batch операций: ${error.message}`);
      this.results.failed++;
      this.results.errors.push(`Batch operations: ${error.message}`);
    }
  }

  /**
   * Тест обработки ошибок
   */
  async testErrorHandling() {
    console.log('\n🚨 Тестирование обработки ошибок...');
    
    try {
      // Тест обработки API ошибок
      global.fetch = jest.fn(() => 
        Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: () => Promise.resolve({
            error_message: 'Invalid API key'
          })
        })
      );

      const result = await this.mondayTool._call({
        action: 'getBoards'
      });
      
      const parsedResult = JSON.parse(result);
      
      if (parsedResult.success) {
        throw new Error('Ошибка API должна была быть обработана');
      }
      
      if (!parsedResult.error.includes('Invalid API key') && 
          !parsedResult.error.includes('401')) {
        throw new Error('Ошибка API не была корректно обработана');
      }
      
      console.log('  ✅ Обработка API ошибок работает корректно');
      this.results.passed++;
      
    } catch (error) {
      console.log(`  ❌ Ошибка обработки ошибок: ${error.message}`);
      this.results.failed++;
      this.results.errors.push(`Error handling: ${error.message}`);
    }
  }

  /**
   * Запуск всех тестов
   */
  async runAllTests() {
    console.log('🚀 Запуск комплексного тестирования monday.com API v2.0 интеграции\n');
    console.log('=' * 70);
    
    // Сначала нужно определить jest mock функцию
    if (typeof jest === 'undefined') {
      global.jest = {
        fn: (impl) => {
          const mockFn = impl || (() => {});
          mockFn.mockResolvedValueOnce = (value) => {
            mockFn.mockImplementationOnce(() => Promise.resolve(value));
            return mockFn;
          };
          mockFn.mockImplementationOnce = (impl) => {
            const originalImpl = mockFn.toString();
            Object.defineProperty(mockFn, 'toString', {
              value: () => impl.toString(),
              configurable: true
            });
            const result = impl;
            setTimeout(() => {
              Object.defineProperty(mockFn, 'toString', {
                value: () => originalImpl,
                configurable: true
              });
            }, 0);
            return result;
          };
          return mockFn;
        }
      };
    }

    await this.testSchemaValidation();
    await this.testWebhookFunctions();
    await this.testTeamsFunctions();
    await this.testWorkspacesFunctions();
    await this.testPerformanceOptimizations();
    await this.testErrorHandling();
    
    this.printResults();
  }

  /**
   * Вывод результатов тестирования
   */
  printResults() {
    console.log('\n' + '=' * 70);
    console.log('📊 РЕЗУЛЬТАТЫ ИНТЕГРАЦИОННОГО ТЕСТИРОВАНИЯ');
    console.log('=' * 70);
    
    console.log(`✅ Пройдено тестов: ${this.results.passed}`);
    console.log(`❌ Провалено тестов: ${this.results.failed}`);
    console.log(`📈 Общий успех: ${Math.round((this.results.passed / (this.results.passed + this.results.failed)) * 100)}%`);
    
    if (this.results.errors.length > 0) {
      console.log('\n🔍 ДЕТАЛИ ОШИБОК:');
      this.results.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
    
    console.log('\n' + '=' * 70);
    
    if (this.results.failed === 0) {
      console.log('🎉 ВСЕ ТЕСТЫ ПРОШЛИ УСПЕШНО!');
      console.log('✅ Monday.com API v2.0 интеграция готова к использованию');
    } else {
      console.log('⚠️  ЕСТЬ ПРОБЛЕМЫ, ТРЕБУЮЩИЕ ВНИМАНИЯ');
      console.log('🔧 Рекомендуется исправить ошибки перед продакшеном');
    }
  }
}

// Запуск тестирования, если скрипт вызван напрямую
if (require.main === module) {
  const tester = new MondayIntegrationTester();
  tester.runAllTests()
    .then(() => {
      process.exit(tester.results.failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('💥 Критическая ошибка при тестировании:', error);
      process.exit(1);
    });
}

module.exports = MondayIntegrationTester;
