const MondayTool = require('./../../api/app/clients/tools/structured/MondayTool');

/**
 * ДЕТАЛЬНАЯ ДИАГНОСТИКА ОШИБОК GRAPHQL В MONDAY API
 */
class GraphQLErrorAnalyzer {
  constructor(apiKey) {
    this.mondayTool = new MondayTool({ apiKey });
    this.testBoardId = '9261805849';
  }

  async analyzeGraphQLError(query, variables, description) {
    console.log(`\n🔍 АНАЛИЗ: ${description}`);
    console.log('=' .repeat(50));
    console.log('📝 GraphQL Query:');
    console.log(query);
    console.log('\n📊 Variables:');
    console.log(JSON.stringify(variables, null, 2));
    
    try {
      const result = await this.mondayTool.makeGraphQLRequest(query, variables);
      console.log('✅ УСПЕШНО!');
      console.log('📋 Результат:', JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      console.log('❌ ОШИБКА!');
      console.log('💥 Сообщение:', error.message);
      
      // Попробуем извлечь детали ошибки
      if (error.response && error.response.data) {
        console.log('🔎 Детали ответа API:');
        console.log(JSON.stringify(error.response.data, null, 2));
      }
      
      return null;
    }
  }

  async runAnalysis() {
    console.log('🔬 ДЕТАЛЬНЫЙ АНАЛИЗ GRAPHQL ОШИБОК');
    console.log('=' .repeat(70));

    // 1. Простой тест - получение досок
    await this.analyzeGraphQLError(
      `query {
        boards(limit: 1) {
          id
          name
        }
      }`,
      {},
      'Базовый тест - получение досок'
    );

    // 2. Тест getItems с минимальными полями
    await this.analyzeGraphQLError(
      `query getItems($boardId: [ID!]!) {
        boards(ids: $boardId) {
          id
          name
          items_page(limit: 1) {
            items {
              id
              name
            }
          }
        }
      }`,
      { boardId: [this.testBoardId] },
      'Простой getItems с минимальными полями'
    );

    // 3. Тест с указанием конкретного Board ID
    await this.analyzeGraphQLError(
      `query testBoard($boardId: ID!) {
        boards(ids: [$boardId]) {
          id
          name
          state
        }
      }`,
      { boardId: this.testBoardId },
      'Проверка существования доски'
    );

    // 4. Тест создания webhook с минимальными параметрами
    await this.analyzeGraphQLError(
      `mutation {
        create_webhook(
          board_id: ${this.testBoardId},
          url: "https://webhook.site/test",
          event: create_item
        ) {
          id
        }
      }`,
      {},
      'Простое создание webhook без variables'
    );

    // 5. Проверим права доступа
    await this.analyzeGraphQLError(
      `query {
        me {
          id
          name
          email
        }
      }`,
      {},
      'Проверка прав доступа API ключа'
    );
  }
}

// Запуск анализа
async function main() {
  const apiKey = process.env.MONDAY_API_KEY;
  
  if (!apiKey) {
    console.error('❌ MONDAY_API_KEY не установлен!');
    process.exit(1);
  }

  const analyzer = new GraphQLErrorAnalyzer(apiKey);
  await analyzer.runAnalysis();
}

main().catch(console.error); 