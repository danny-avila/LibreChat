const MondayTool = require('./../../api/app/clients/tools/structured/MondayTool');

const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';

// Создаем инструмент с перехватом GraphQL
class DebugMondayTool extends MondayTool {
  async makeGraphQLRequest(query, variables = {}) {
    console.log('🔍 DEBUG: Отправляемый запрос:');
    console.log('Query:', query);
    console.log('Variables:', JSON.stringify(variables, null, 2));
    
    const fetch = require('node-fetch');
    
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.apiKey,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ query, variables })
    });

    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const responseText = await response.text();
      console.error('Response text:', responseText);
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (data.errors) {
      console.error('GraphQL Errors:', JSON.stringify(data.errors, null, 2));
      throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
    }
    
    return data.data;
  }
}

const tool = new DebugMondayTool({ apiKey });

async function testSearchItems() {
  try {
    console.log('🔍 Тестируем searchItems с дебаггером...');
    
    const result = await tool._call({
      action: 'searchItems',
      boardId: '9261805849',
      query: 'Test',
      limit: 5
    });

    const data = JSON.parse(result);
    console.log('✅ searchItems результат:', data);
    console.log('📊 Найдено элементов:', data.data?.length || 0);
    
  } catch (error) {
    console.error('❌ Ошибка searchItems:', error.message);
  }
}

testSearchItems(); 