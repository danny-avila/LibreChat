#!/usr/bin/env node

/**
 * Тест загрузки инструментов после перемещения тестовых файлов
 */

console.log('🔍 Проверка загрузки инструментов...\n');

const fs = require('fs');
const path = require('path');

try {
  // Проверяем что модули доступны
  const { Tool } = require('@langchain/core/tools');
  console.log('✅ @langchain/core/tools загружен');

  const directory = './api/app/clients/tools/structured';
  const files = fs.readdirSync(directory);
  
  console.log('📁 Файлы в structured:', files.filter(f => f.endsWith('.js')).length);
  
  let loaded = 0, errors = 0;
  
  for (const file of files) {
    if (!file.endsWith('.js') || file.endsWith('.test.js')) {
      continue;
    }
    
    try {
      const filePath = path.join(directory, file);
      console.log(`\n🔧 Тестируем: ${file}`);
      
      const ToolClass = require(filePath);
      
      if (!ToolClass || !(ToolClass.prototype instanceof Tool)) {
        console.log(`   ⚠️  Не является Tool классом`);
        continue;
      }
      
      const instance = new ToolClass({ override: true });
      console.log(`   ✅ Загружен как: ${instance.name}`);
      loaded++;
      
    } catch(error) {
      console.log(`   ❌ Ошибка: ${error.message.substring(0, 60)}...`);
      errors++;
    }
  }
  
  console.log('\n📊 РЕЗУЛЬТАТ:');
  console.log(`   ✅ Успешно загружено: ${loaded}`);
  console.log(`   ❌ Ошибок: ${errors}`);
  console.log(`   📈 Процент успеха: ${Math.round(loaded/(loaded+errors)*100)}%`);
  
  if (errors === 0) {
    console.log('\n🎉 Все инструменты загружаются корректно!');
  }
  
} catch (error) {
  console.error('💥 Критическая ошибка:', error.message);
} 