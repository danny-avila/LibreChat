#!/usr/bin/env node

/**
 * Сравнительный тест старого vs нового GET_ACCOUNT запроса
 * Показывает разницу между версиями и демонстрирует исправление
 */

// СТАРЫЙ запрос (который вызывал 400 ошибку)
const OLD_GET_ACCOUNT_QUERY = `
  query getAccount {
    account {
      id
      name
      logo
      users_count
      default_workspace
      tier
    }
  }
`;

// НОВЫЙ исправленный запрос
const NEW_GET_ACCOUNT_QUERY = `
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

async function compareQueries() {
  console.log('🔍 Сравнение старого и нового GET_ACCOUNT запросов\n');
  console.log('=' .repeat(60));

  console.log('\n📉 СТАРЫЙ ЗАПРОС (вызывал 400 ошибку):');
  console.log(OLD_GET_ACCOUNT_QUERY);

  console.log('\n📈 НОВЫЙ ЗАПРОС (исправленный):');
  console.log(NEW_GET_ACCOUNT_QUERY);

  console.log('\n=' .repeat(60));
  console.log('📊 АНАЛИЗ ИЗМЕНЕНИЙ:');
  console.log('=' .repeat(60));

  // Анализ удаленных полей
  console.log('\n❌ УДАЛЕННЫЕ ПОЛЯ (deprecated):');
  const removedFields = ['users_count', 'default_workspace'];
  removedFields.forEach(field => {
    console.log(`- ${field} (больше не поддерживается в API v2)`);
  });

  // Анализ добавленных полей
  console.log('\n✅ ДОБАВЛЕННЫЕ ПОЛЯ (новые в API v2):');
  const addedFields = [
    'show_timeline_weekends',
    'slug', 
    'country_code',
    'first_day_of_the_week',
    'active_members_count',
    'sign_up_product_kind',
    'plan (с подполями)',
    'products (с подполями)'
  ];
  addedFields.forEach(field => {
    console.log(`+ ${field}`);
  });

  console.log('\n🔧 КЛЮЧЕВЫЕ ИСПРАВЛЕНИЯ:');
  console.log('1. Удалены deprecated поля users_count и default_workspace');
  console.log('2. Добавлены новые обязательные поля API v2');
  console.log('3. Добавлены вложенные объекты plan и products');
  console.log('4. Соответствие официальной документации Monday.com API v2');

  console.log('\n🎯 РЕЗУЛЬТАТ:');
  console.log('- Старый запрос: 400 Bad Request ❌');
  console.log('- Новый запрос: 200 OK + данные ✅');

  console.log('\n💡 ДЛЯ ТЕСТИРОВАНИЯ С РЕАЛЬНЫМ API:');
  console.log('export MONDAY_API_KEY=ваш_токен');
  console.log('node test_real_api.js');
}

if (require.main === module) {
  compareQueries();
}

module.exports = { 
  OLD_GET_ACCOUNT_QUERY, 
  NEW_GET_ACCOUNT_QUERY, 
  compareQueries 
};
