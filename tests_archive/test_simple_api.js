/**
 * Простейший тест API Monday.com
 */

const https = require('https');

const apiKey = "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM";

console.log('🚀 Начинаем простой тест...');

// Простой запрос для получения досок
const query = `query { boards(limit: 1) { id name } }`;

const data = JSON.stringify({ query });

const options = {
  hostname: 'api.monday.com',
  port: 443,
  path: '/v2',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': apiKey,
    'Content-Length': Buffer.byteLength(data)
  }
};

console.log('📋 Делаем запрос...');

const req = https.request(options, (res) => {
  console.log(`📊 Статус ответа: ${res.statusCode}`);
  
  let responseData = '';
  
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    console.log('📦 Получен ответ:', responseData);
    
    try {
      const result = JSON.parse(responseData);
      
      if (result.errors) {
        console.error('❌ GraphQL ошибки:', result.errors);
      } else {
        console.log('✅ Успех! Данные:', result.data);
        
        if (result.data.boards && result.data.boards.length > 0) {
          const board = result.data.boards[0];
          console.log(`🎯 Найдена доска: "${board.name}" (ID: ${board.id})`);
          
          // Теперь протестируем обновление колонки
          testColumnUpdate(board.id);
        }
      }
    } catch (error) {
      console.error('❌ Ошибка парсинга JSON:', error.message);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Ошибка запроса:', error.message);
});

req.write(data);
req.end();

// Функция для тестирования обновления колонки
function testColumnUpdate(boardId) {
  console.log('\n🔧 Тестируем обновление колонки...');
  
  // Сначала получим элементы доски
  const itemsQuery = `
    query($boardId: ID!) {
      boards(ids: [$boardId]) {
        items(limit: 1) {
          id
          name
          column_values {
            id
            type
            text
          }
        }
        columns {
          id
          title
          type
        }
      }
    }
  `;
  
  const itemsData = JSON.stringify({
    query: itemsQuery,
    variables: { boardId }
  });
  
  const itemsReq = https.request(options, (res) => {
    let responseData = '';
    
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    
    res.on('end', () => {
      try {
        const result = JSON.parse(responseData);
        
        if (result.data.boards[0].items.length > 0) {
          const item = result.data.boards[0].items[0];
          const columns = result.data.boards[0].columns;
          
          console.log(`📋 Найден элемент: "${item.name}" (ID: ${item.id})`);
          console.log(`📊 Колонки: ${columns.length}`);
          
          // Найдем текстовую колонку
          const textColumn = columns.find(col => col.type === 'text');
          
          if (textColumn) {
            console.log(`🎯 Обновляем текстовую колонку: "${textColumn.title}"`);
            
            // Обновляем колонку
            const updateMutation = `
              mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
                change_simple_column_value(
                  board_id: $boardId, 
                  item_id: $itemId, 
                  column_id: $columnId, 
                  value: $value
                ) {
                  id
                }
              }
            `;
            
            const updateData = JSON.stringify({
              query: updateMutation,
              variables: {
                boardId: boardId,
                itemId: item.id,
                columnId: textColumn.id,
                value: `API Test ${new Date().toISOString()}`
              }
            });
            
            const updateReq = https.request(options, (res) => {
              let responseData = '';
              
              res.on('data', (chunk) => {
                responseData += chunk;
              });
              
              res.on('end', () => {
                console.log('🔄 Результат обновления:', responseData);
                
                try {
                  const updateResult = JSON.parse(responseData);
                  if (updateResult.errors) {
                    console.error('❌ Ошибки обновления:', updateResult.errors);
                  } else {
                    console.log('✅ Колонка успешно обновлена!');
                  }
                } catch (error) {
                  console.error('❌ Ошибка парсинга обновления:', error.message);
                }
              });
            });
            
            updateReq.on('error', (error) => {
              console.error('❌ Ошибка запроса обновления:', error.message);
            });
            
            updateReq.write(updateData);
            updateReq.end();
            
          } else {
            console.log('⚠️ Не найдена текстовая колонка для тестирования');
          }
          
        } else {
          console.log('⚠️ Нет элементов в доске');
        }
        
      } catch (error) {
        console.error('❌ Ошибка парсинга элементов:', error.message);
      }
    });
  });
  
  itemsReq.on('error', (error) => {
    console.error('❌ Ошибка запроса элементов:', error.message);
  });
  
  itemsReq.write(itemsData);
  itemsReq.end();
}
