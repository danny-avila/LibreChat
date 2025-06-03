console.log('🚀 Начинаем тест...');

const apiKey = process.env.MONDAY_API_KEY;
console.log('API Key:', apiKey ? 'SET' : 'NOT SET');

if (!apiKey) {
  console.error('❌ API ключ не установлен');
  process.exit(1);
}

console.log('✅ API ключ найден');
console.log('🔧 Тестируем прямые HTTP запросы...');

const https = require('https');

const data = JSON.stringify({
  query: `
    query {
      me {
        id
        name
        email
      }
    }
  `
});

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

console.log('📡 Отправляем запрос...');

const req = https.request(options, (res) => {
  console.log(`📊 Статус: ${res.statusCode}`);
  
  let responseData = '';
  
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    console.log('📋 Ответ получен');
    console.log('Response:', responseData);
    
    try {
      const parsed = JSON.parse(responseData);
      if (parsed.data && parsed.data.me) {
        console.log('✅ API работает! Пользователь:', parsed.data.me.name);
      } else if (parsed.errors) {
        console.error('❌ GraphQL ошибки:', parsed.errors);
      }
    } catch (error) {
      console.error('❌ Ошибка парсинга:', error.message);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Ошибка запроса:', error.message);
});

console.log('📤 Отправляем данные...');
req.write(data);
req.end();
console.log('✅ Запрос отправлен');
