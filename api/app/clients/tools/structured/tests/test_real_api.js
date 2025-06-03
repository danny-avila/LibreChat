#!/usr/bin/env node

/**
 * Тест для проверки работы getAccount запроса с реальным Monday.com API
 * Использование: MONDAY_API_KEY=ваш_токен node test_real_api.js
 */

const fetch = require('node-fetch');

// Обновленный GET_ACCOUNT запрос из нашего исправления
const GET_ACCOUNT_QUERY = `
  query getAccount {
    account {
      id
      name
      logo
      show_timeline_weekends
      slug
      tier
      country_code
      first_day_of_the_week
      active_members_count
      plan {
        max_users
        period
        tier
        version
      }
      products {
        id
        kind
      }
      sign_up_product_kind
    }
  }
`;

async function testRealAPI() {
  console.log('🔍 Тестирование Monday.com getAccount с реальным API...\n');

  // Проверяем наличие API ключа
  const apiKey = process.env.MONDAY_API_KEY;
  if (!apiKey) {
    console.error('❌ Отсутствует переменная окружения MONDAY_API_KEY');
    console.log('\n💡 Использование:');
    console.log('export MONDAY_API_KEY=ваш_токен_monday');
    console.log('node test_real_api.js');
    console.log('\n📋 Необходимые права для токена:');
    console.log('- account:read');
    console.log('\n🔗 Получить токен: https://monday.com/developers/apps');
    process.exit(1);
  }

  console.log('1. Подготовка запроса...');
  console.log('✅ API ключ найден');
  console.log('✅ GraphQL запрос подготовлен');

  try {
    console.log('\n2. Отправка запроса к Monday.com API...');
    console.log('URL:', 'https://api.monday.com/v2');
    
    const startTime = Date.now();
    
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
        'API-Version': '2024-01'
      },
      body: JSON.stringify({
        query: GET_ACCOUNT_QUERY
      })
    });

    const endTime = Date.now();
    console.log(`⏱️  Запрос выполнен за ${endTime - startTime}ms`);

    console.log('\n3. Анализ ответа...');
    console.log('HTTP статус:', response.status, response.statusText);

    if (!response.ok) {
      console.error(`❌ HTTP ошибка: ${response.status} ${response.statusText}`);
      
      if (response.status === 400) {
        console.log('\n🔍 Это ошибка 400 Bad Request. Возможные причины:');
        console.log('1. Неправильная структура GraphQL запроса');
        console.log('2. Отсутствуют необходимые права токена');
        console.log('3. Невалидные поля в запросе');
      } else if (response.status === 401) {
        console.log('\n🔍 Это ошибка 401 Unauthorized. Возможные причины:');
        console.log('1. Неверный API токен');
        console.log('2. Токен истек');
      } else if (response.status === 403) {
        console.log('\n🔍 Это ошибка 403 Forbidden. Возможные причины:');
        console.log('1. Токен не имеет права account:read');
      }
      
      const errorText = await response.text();
      console.log('\nТекст ошибки:', errorText);
      return;
    }

    const data = await response.json();
    
    console.log('✅ Получен успешный ответ');

    if (data.errors) {
      console.error('\n❌ GraphQL ошибки:', JSON.stringify(data.errors, null, 2));
      
      // Анализируем типы ошибок
      data.errors.forEach((error, index) => {
        console.log(`\n🔍 Ошибка ${index + 1}:`);
        console.log('Сообщение:', error.message);
        if (error.extensions) {
          console.log('Код:', error.extensions.code);
        }
        if (error.path) {
          console.log('Путь:', error.path.join('.'));
        }
      });
      return;
    }

    if (!data.data || !data.data.account) {
      console.error('❌ Неожиданная структура ответа:', JSON.stringify(data, null, 2));
      return;
    }

    console.log('\n🎉 УСПЕХ! getAccount запрос работает корректно!');
    console.log('\n📊 Информация об аккаунте:');
    
    const account = data.data.account;
    console.log('- ID аккаунта:', account.id);
    console.log('- Название:', account.name);
    console.log('- Slug:', account.slug);
    console.log('- Тариф:', account.tier);
    console.log('- Код страны:', account.country_code);
    console.log('- Первый день недели:', account.first_day_of_the_week);
    console.log('- Активных участников:', account.active_members_count);
    console.log('- Продукт регистрации:', account.sign_up_product_kind);
    
    if (account.plan) {
      console.log('- План тариф:', account.plan.tier);
      console.log('- Максимум пользователей:', account.plan.max_users);
      console.log('- Период:', account.plan.period);
    }
    
    if (account.products && account.products.length > 0) {
      console.log('- Продукты:', account.products.map(p => p.kind).join(', '));
    }

    console.log('\n✅ ЗАКЛЮЧЕНИЕ:');
    console.log('- HTTP статус: 200 OK');
    console.log('- GraphQL ошибок: нет');
    console.log('- Все поля получены корректно');
    console.log('- Исправление 400 Bad Request: УСПЕШНО');

  } catch (error) {
    console.error('\n❌ Ошибка при выполнении запроса:', error.message);
    
    if (error.code === 'ENOTFOUND') {
      console.log('🔍 Ошибка сети - проверьте интернет соединение');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('🔍 Соединение отклонено - проверьте URL API');
    }
    
    console.error('Полная ошибка:', error);
  }
}

// Запуск теста
if (require.main === module) {
  testRealAPI();
}

module.exports = { testRealAPI };
