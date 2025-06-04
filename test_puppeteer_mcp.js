#!/usr/bin/env node

/**
 * Тестовый скрипт для проверки работы Puppeteer MCP сервера
 * Этот скрипт проверяет:
 * 1. Доступность пакета @modelcontextprotocol/server-puppeteer через npx
 * 2. Корректность конфигурации librechat.yaml
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const yaml = require('js-yaml');

console.log('🔍 Тестирование Puppeteer MCP интеграции...\n');

// 1. Проверяем конфигурацию librechat.yaml
console.log('1. Проверка конфигурации librechat.yaml...');
try {
  const yamlContent = fs.readFileSync('librechat.yaml', 'utf8');
  const config = yaml.load(yamlContent);
  
  if (config.mcpServers && config.mcpServers.puppeteer) {
    console.log('✅ Puppeteer MCP сервер найден в конфигурации');
    console.log('   - Command:', config.mcpServers.puppeteer.command);
    console.log('   - Args:', config.mcpServers.puppeteer.args);
    console.log('   - Timeout:', config.mcpServers.puppeteer.timeout);
    console.log('   - Description:', config.mcpServers.puppeteer.description);
  } else {
    console.log('❌ Puppeteer MCP сервер не найден в конфигурации');
    process.exit(1);
  }
} catch (error) {
  console.log('❌ Ошибка чтения конфигурации:', error.message);
  process.exit(1);
}

// 2. Проверяем доступность пакета через npx
console.log('\n2. Проверка доступности пакета @modelcontextprotocol/server-puppeteer...');
try {
  // Проверяем что пакет доступен через npx
  const result = execSync('npx --yes @modelcontextprotocol/server-puppeteer --version', { 
    encoding: 'utf8',
    timeout: 30000,
    stdio: 'pipe'
  });
  console.log('✅ Пакет доступен через npx');
} catch (error) {
  console.log('❌ Пакет недоступен через npx:', error.message);
  console.log('🔧 Пытаемся установить пакет...');
  
  try {
    execSync('npm install -g @modelcontextprotocol/server-puppeteer', { 
      encoding: 'utf8',
      timeout: 60000 
    });
    console.log('✅ Пакет успешно установлен');
  } catch (installError) {
    console.log('❌ Не удалось установить пакет:', installError.message);
    console.log('💡 Рекомендация: запустите "npm install -g @modelcontextprotocol/server-puppeteer"');
  }
}

// 3. Проверяем frontend компоненты
console.log('\n3. Проверка frontend компонентов...');
const mcpSettingsPath = 'client/src/components/Nav/SettingsTabs/General/MCPSettings.tsx';
if (fs.existsSync(mcpSettingsPath)) {
  console.log('✅ MCPSettings компонент найден');
} else {
  console.log('❌ MCPSettings компонент не найден');
}

const generalPath = 'client/src/components/Nav/SettingsTabs/General/General.tsx';
if (fs.existsSync(generalPath)) {
  const generalContent = fs.readFileSync(generalPath, 'utf8');
  if (generalContent.includes('MCPSettings')) {
    console.log('✅ MCPSettings импортирован в General настройки');
  } else {
    console.log('❌ MCPSettings не импортирован в General настройки');
  }
}

// 4. Проверяем локализацию
console.log('\n4. Проверка локализации...');
const localizationPath = 'client/src/locales/en/translation.json';
if (fs.existsSync(localizationPath)) {
  const localization = JSON.parse(fs.readFileSync(localizationPath, 'utf8'));
  if (localization['com_ui_mcp_settings'] && localization['com_ui_mcp_settings_description']) {
    console.log('✅ Ключи локализации добавлены');
  } else {
    console.log('❌ Ключи локализации отсутствуют');
  }
}

console.log('\n🎉 Тестирование завершено!');
console.log('\n📋 Следующие шаги:');
console.log('   1. Запустите сервер: npm run backend:dev');
console.log('   2. Запустите frontend: npm run frontend:dev');  
console.log('   3. Зайдите в настройки как администратор');
console.log('   4. Проверьте появление MCP Settings в General');
console.log('   5. Попробуйте команду: "Сделай скриншот google.com"'); 