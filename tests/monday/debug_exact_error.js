const fetch = require('node-fetch');

async function debugExactError() {
  const apiKey = process.env.MONDAY_API_KEY;
  
  if (!apiKey) {
    console.error('❌ MONDAY_API_KEY не установлен!');
    process.exit(1);
  }

  const testBoardId = '9261805849';

  console.log('🔍 ДЕТАЛЬНАЯ ДИАГНОСТИКА ОШИБКИ 400 BAD REQUEST');
  console.log('=' .repeat(60));

  // Тест проблемного запроса getItems
  const query = `
    query getItems($boardId: [ID!]!, $limit: Int!) {
      boards(ids: $boardId) {
        id
        name
        items_page(limit: $limit) {
          cursor
          items {
            id
            name
            state
            created_at
            updated_at
            group {
              id
              title
            }
            column_values {
              id
              title
              type
              text
              value
            }
          }
        }
      }
    }
  `;

  const variables = {
    boardId: [testBoardId],
    limit: 3
  };

  console.log('\n📝 GraphQL Query:');
  console.log(query);
  console.log('\n📊 Variables:');
  console.log(JSON.stringify(variables, null, 2));

  try {
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ query, variables })
    });

    const responseText = await response.text();
    console.log('\n📄 Raw Response:');
    console.log(responseText);

    if (!response.ok) {
      console.log(`\n❌ HTTP Error: ${response.status} ${response.statusText}`);
      console.log('Headers:', response.headers.raw());
    }

    try {
      const data = JSON.parse(responseText);
      
      if (data.errors) {
        console.log('\n❌ GraphQL Errors:');
        data.errors.forEach((error, index) => {
          console.log(`\nError ${index + 1}:`);
          console.log('Message:', error.message);
          console.log('Extensions:', JSON.stringify(error.extensions, null, 2));
          console.log('Path:', error.path);
          console.log('Locations:', error.locations);
        });
      }
      
      if (data.data) {
        console.log('\n✅ Data received:');
        console.log(JSON.stringify(data.data, null, 2));
      }
    } catch (e) {
      console.log('\n❌ Failed to parse response as JSON');
    }

  } catch (error) {
    console.error('\n❌ Request failed:', error.message);
  }
}

debugExactError(); 