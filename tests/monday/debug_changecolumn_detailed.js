const fetch = require('node-fetch');

const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';

async function testChangeColumnValue() {
  // Сначала получим список актуальных элементов
  console.log('🔍 Сначала получаем актуальные элементы...');
  
  const getItemsQuery = `
    query {
      boards(ids: ["9261805849"]) {
        items_page(limit: 5) {
          items {
            id
            name
            column_values {
              id
              type
              text
              value
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ query: getItemsQuery })
    });

    const data = await response.json();
    console.log('Полученные элементы:', JSON.stringify(data, null, 2));

    if (data.data?.boards?.[0]?.items_page?.items?.length > 0) {
      const firstItem = data.data.boards[0].items_page.items[0];
      console.log('Используем элемент:', firstItem.id, firstItem.name);

      // Найдем текстовую колонку
      const textColumn = firstItem.column_values.find(col => col.type === 'text');
      if (textColumn) {
        console.log('Найдена текстовая колонка:', textColumn.id);

        // Теперь попробуем обновить значение
        const updateQuery = `
          mutation {
            change_column_value(
              board_id: "9261805849",
              item_id: "${firstItem.id}",
              column_id: "${textColumn.id}",
              value: "\"Updated via direct API test\""
            ) {
              id
              name
              column_values {
                id
                type
                text
                value
              }
            }
          }
        `;

        console.log('\n🔍 Обновляем значение колонки...');
        console.log('Update query:', updateQuery);

        const updateResponse = await fetch('https://api.monday.com/v2', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': apiKey,
            'API-Version': '2024-10'
          },
          body: JSON.stringify({ query: updateQuery })
        });

        const updateData = await updateResponse.json();
        console.log('Update response:', JSON.stringify(updateData, null, 2));

        if (updateData.errors) {
          console.error('❌ Ошибки при обновлении:', updateData.errors);
        } else {
          console.log('✅ Колонка успешно обновлена!');
        }
      } else {
        console.error('❌ Не найдена текстовая колонка');
      }
    } else {
      console.error('❌ Элементы не найдены');
    }

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
}

testChangeColumnValue(); 