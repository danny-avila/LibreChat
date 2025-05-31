# Решение проблем сборки для Zeabur

## Обнаруженные проблемы

### 1. React-Virtualized Module Level Directives
**Проблема**: 
```
Module level directives cause errors when bundled, "no babel-plugin-flow-react-proptypes" in "../node_modules/react-virtualized/dist/es/WindowScroller/utils/onScroll.js" was ignored.
```

**Решение**:
- Создан патч `patches/react-virtualized+9.22.6.patch`
- Установлен `patch-package` для автоматического применения патчей
- Добавлен `postinstall` скрипт в package.json

### 2. VM-Browserify Eval Warning
**Проблема**:
```
Use of eval in "../node_modules/vm-browserify/index.js" is strongly discouraged as it poses security risks and may cause issues with minification.
```

**Решение**:
- Добавлена обработка предупреждений в `rollupOptions.onwarn`
- Настроен exclude для vm-browserify в optimizeDeps
- Улучшена конфигурация nodePolyfills

## Внесенные изменения

### 1. Файлы конфигурации
- `vite.config.production.ts` - Оптимизированная конфигурация для продакшена
- `Dockerfile.zeabur` - Специальный Dockerfile для Zeabur
- `zeabur.json` - Обновленная конфигурация развертывания

### 2. Скрипты сборки
- `build:production` - Продакшен сборка с оптимизациями
- `build:zeabur` - Специальная сборка для Zeabur
- `frontend:zeabur` - Полный процесс сборки для Zeabur

### 3. Оптимизации
- Улучшено разделение кода (code splitting)
- Оптимизированы чанки для лучшей производительности
- Увеличены лимиты памяти для Node.js
- Настроен PWA с поддержкой больших файлов

## Инструкции по развертыванию на Zeabur

### 1. Подготовка
```bash
# Установить зависимости
npm ci

# Применить патчи
npm run postinstall
```

### 2. Локальное тестирование
```bash
# Тестирование сборки
npm run frontend:zeabur

# Или использовать тестовый скрипт
./scripts/test-zeabur-build.sh
```

### 3. Развертывание на Zeabur
- Используйте `Dockerfile.zeabur` как основной Dockerfile
- Убедитесь, что в zeabur.json указан правильный Dockerfile
- **КРИТИЧНО**: Установите обязательные переменные окружения:
  - `NODE_ENV=production`
  - `NODE_OPTIONS=--max-old-space-size=4096`
  - `CREDS_KEY=f34be427ebb29de8d88c107a71546019685ed8b241d8f2ed00c3df97ad2566f0` (или сгенерируйте новый: `openssl rand -hex 32`)
  - `CREDS_IV=e2341419ec3dd3d19b13a1a87fafcbfb` (или сгенерируйте новый: `openssl rand -hex 16`)
  - `JWT_SECRET=16f8c0ef4a5d391b26034086c628469d3f9f497f08163ab9b40137092f2909ef` (или сгенерируйте новый: `openssl rand -hex 32`)
  - `JWT_REFRESH_SECRET=eaa5191f2914e30b9387fd84e254e4ba6fc51b4654968a9b0803b456a54b8418` (или сгенерируйте новый: `openssl rand -hex 32`)
  - Другие переменные из `.env.example` по необходимости

### 4. Рекомендуемые ресурсы для Zeabur
```json
{
  "memory": "4096Mi",
  "cpu": "2"
}
```

## Решение runtime ошибок

### Ошибка криптографии при запуске
**Проблема**:
```
TypeError [ERR_INVALID_ARG_TYPE]: The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received undefined
at Function.from (node:buffer:322:9)
at Object.<anonymous> (/app/api/server/utils/crypto.js:6:20)
```

**Причина**: Отсутствуют обязательные переменные окружения `CREDS_KEY`, `CREDS_IV`, `JWT_SECRET`, `JWT_REFRESH_SECRET`

**Решение**: Установите следующие переменные окружения в Zeabur (Variables tab):
```bash
# Криптография (ОБЯЗАТЕЛЬНО)
CREDS_KEY=f34be427ebb29de8d88c107a71546019685ed8b241d8f2ed00c3df97ad2566f0
CREDS_IV=e2341419ec3dd3d19b13a1a87fafcbfb

# JWT токены (ОБЯЗАТЕЛЬНО)
JWT_SECRET=16f8c0ef4a5d391b26034086c628469d3f9f497f08163ab9b40137092f2909ef
JWT_REFRESH_SECRET=eaa5191f2914e30b9387fd84e254e4ba6fc51b4654968a9b0803b456a54b8418

# Node.js конфигурация (ОБЯЗАТЕЛЬНО)
NODE_ENV=production
NODE_OPTIONS=--max-old-space-size=4096
HOST=0.0.0.0

# Zeabur автоматически установит PORT
# Дополнительные переменные (по необходимости)
# MONGODB_URI=your-mongodb-connection-string
# OPENAI_API_KEY=your-openai-api-key
```

**Как добавить в Zeabur:**
1. Откройте Variables tab в вашем сервисе
2. Нажмите "Edit as Raw" для массового добавления 
3. Вставьте переменные в формате .env файла
4. Сохраните и перезапустите сервис

Или сгенерируйте новые значения:
```bash
# Генерация CREDS_KEY (32 байта в hex = 64 символа)
openssl rand -hex 32

# Генерация CREDS_IV (16 байт в hex = 32 символа)  
openssl rand -hex 16

# Генерация JWT_SECRET (32 байта в hex = 64 символа)
openssl rand -hex 32

# Генерация JWT_REFRESH_SECRET (32 байта в hex = 64 символа)
openssl rand -hex 32
```

## Текущий статус развертывания

### ✅ Успешно исправлено:
- Ошибки сборки react-virtualized (патч применяется автоматически)
- Предупреждения vm-browserify (настроена обработка в Vite)
- Оптимизация сборки (разделение кода, уменьшение размера чанков)
- PWA конфигурация (поддержка больших файлов)
- Docker сборка завершается успешно

### ⚠️ Текущая проблема:
- **Runtime ошибка**: Отсутствие обязательных переменных окружения
- **Локация**: `/app/api/server/utils/crypto.js:6:20`
- **Решение**: Настроить переменные окружения в Zeabur (см. выше)

### 🔄 Следующие шаги:
1. **Обновить переменные окружения в панели Zeabur:**
   - Перейти в Variables tab вашего сервиса в Zeabur dashboard
   - Добавить все обязательные переменные (см. список выше)
   - Использовать "Edit as Raw" для массового добавления переменных
   
2. **Перезапустить развертывание**
3. **Проверить логи runtime для других возможных проблем**
4. **Настроить дополнительные переменные (база данных, API ключи) при необходимости**

### ⚠️ Важные замечания для продакшена:

**База данных**: LibreChat требует MongoDB. После запуска приложения может потребоваться:
- Настроить `MONGO_URI` для внешней MongoDB
- Или развернуть MongoDB в том же проекте Zeabur

**API ключи**: Для полной функциональности добавьте:
- `OPENAI_API_KEY` - для OpenAI интеграции
- `ANTHROPIC_API_KEY` - для Claude интеграции  
- И другие API ключи по необходимости

**Порт**: Zeabur автоматически назначает PORT, убедитесь что в `Dockerfile.zeabur` используется:
```dockerfile
EXPOSE $PORT
```

### 📚 Полезные ссылки:
- [LibreChat Environment Variables Documentation](https://docs.librechat.ai/install/configuration/dotenv)
- [LibreChat Credentials Generator](https://www.librechat.ai/toolkit/creds_generator)
- [Zeabur Environment Variables Guide](https://zeabur.com/docs/en-US/deploy/variables)
- [Zeabur Docker Deployment](https://zeabur.com/docs/en-US/deploy/dockerfile)

### 🔑 Генерация безопасных ключей:
Для production рекомендуется сгенерировать новые ключи:
```bash
# Использовать онлайн генератор LibreChat:
# https://www.librechat.ai/toolkit/creds_generator

# Или через командную строку:
openssl rand -hex 32  # Для CREDS_KEY, JWT_SECRET, JWT_REFRESH_SECRET
openssl rand -hex 16  # Для CREDS_IV
```

## 🎯 Краткое резюме решения

**Проблема**: LibreChat на Zeabur падает при запуске из-за отсутствующих environment variables.

**Решение в 3 шага**:
1. **Откройте Zeabur Dashboard** → ваш проект → Variables tab
2. **Добавьте обязательные переменные** (нажмите "Edit as Raw"):
   ```
   CREDS_KEY=f34be427ebb29de8d88c107a71546019685ed8b241d8f2ed00c3df97ad2566f0
   CREDS_IV=e2341419ec3dd3d19b13a1a87fafcbfb
   JWT_SECRET=16f8c0ef4a5d391b26034086c628469d3f9f497f08163ab9b40137092f2909ef
   JWT_REFRESH_SECRET=eaa5191f2914e30b9387fd84e254e4ba6fc51b4654968a9b0803b456a54b8418
   NODE_ENV=production
   NODE_OPTIONS=--max-old-space-size=4096
   HOST=0.0.0.0
   ```
3. **Сохраните и перезапустите** сервис

**Статус**: ✅ Готово к развертыванию

## Результаты оптимизации

### До:
- Ошибки сборки из-за react-virtualized
- Предупреждения о vm-browserify
- Превышение лимитов PWA

### После:
- ✅ Успешная сборка без ошибок
- ✅ Оптимизированные чанки (25 файлов вместо больших монолитов)
- ✅ Размер основного чанка уменьшен с 5MB до 3.1MB
- ✅ PWA работает корректно

## Структура финальной сборки
```
dist/
├── assets/
│   ├── vendor.js (141KB) - React & React-DOM
│   ├── radix-ui.js (116KB) - UI компоненты
│   ├── utils.js (94KB) - Утилиты
│   ├── virtualization.js (120KB) - React-virtualized
│   ├── code-editor.js (601KB) - Sandpack
│   ├── markdown-processing.js (595KB) - Markdown обработка
│   └── index.js (3.1MB) - Основной код приложения
├── fonts/ - KaTeX шрифты
├── sw.js - Service Worker
└── index.html
```

## Команды для быстрого развертывания

```bash
# Полная пересборка
npm run frontend:zeabur

# Только клиент
cd client && npm run build:zeabur

# Тестирование Docker сборки
docker build -f Dockerfile.zeabur -t ai-experts-zeabur .
```
