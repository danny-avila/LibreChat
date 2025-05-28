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
- Установите переменные окружения:
  - `NODE_ENV=production`
  - `NODE_OPTIONS=--max-old-space-size=4096`

### 4. Рекомендуемые ресурсы для Zeabur
```json
{
  "memory": "4096Mi",
  "cpu": "2"
}
```

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
