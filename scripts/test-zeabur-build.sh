#!/bin/bash

# Скрипт для тестирования сборки перед развертыванием на Zeabur
# Воспроизводит условия сборки на Zeabur локально

echo "🔧 Тестирование сборки для Zeabur..."

# Очистка кэша и node_modules
echo "🧹 Очистка кэша..."
rm -rf node_modules client/node_modules api/node_modules packages/*/node_modules
rm -rf client/dist client/.vite
npm cache clean --force

# Установка зависимостей
echo "📦 Установка зависимостей..."
npm ci

# Применение патчей
echo "🩹 Применение патчей для react-virtualized..."
npm run postinstall

# Увеличиваем лимиты памяти для Node.js
export NODE_OPTIONS="--max-old-space-size=4096"
export NODE_ENV=production

# Сборка с подробным логированием
echo "🏗️ Сборка frontend..."
npm run frontend 2>&1 | tee build.log

# Проверка результата
if [ $? -eq 0 ]; then
    echo "✅ Сборка успешно завершена!"
    echo "📂 Проверьте директорию client/dist"
    ls -la client/dist/
else
    echo "❌ Ошибка сборки!"
    echo "📋 Проверьте файл build.log для деталей"
    exit 1
fi

echo "🎉 Тест завершен успешно!"
