# Puppeteer MCP Integration для AI-Experts OS

## Описание

Данный документ описывает интеграцию Puppeteer MCP (Model Context Protocol) сервера в AI-Experts OS (LibreChat), которая позволяет AI ассистентам выполнять веб-автоматизацию и создавать скриншоты веб-страниц.

## Возможности

- **Скриншоты веб-страниц**: AI может делать скриншоты любых веб-сайтов
- **Чтение содержимого страниц**: Извлечение текстового контента с веб-страниц
- **Веб-автоматизация**: Базовые операции браузерной автоматизации

## Внесенные изменения

### 1. Конфигурация сервера (`librechat.yaml`)

Добавлена секция `mcpServers` с конфигурацией Puppeteer:

```yaml
# MCP (Model Context Protocol) Servers Configuration
mcpServers:
  puppeteer:
    type: stdio
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-puppeteer"
    timeout: 300000  # 5 minutes timeout for browser operations
    description: "Web automation and screenshot tool using Puppeteer"
    # This server provides web browsing capabilities including:
    # - Taking screenshots of web pages
    # - Reading page content
    # - Web automation tasks
```

### 2. UI компоненты

#### MCPSettings компонент (`client/src/components/Nav/SettingsTabs/General/MCPSettings.tsx`)

Новый админский компонент для управления MCP серверами:
- Отображается только для администраторов
- Позволяет включать/выключать MCP серверы
- Показывает описание и доступные команды

#### Интеграция в General настройки

Компонент добавлен в общие настройки (`client/src/components/Nav/SettingsTabs/General/General.tsx`)

### 3. Локализация

Добавлены новые ключи в `client/src/locales/en/translation.json`:
- `com_ui_mcp_settings`: "MCP Settings"
- `com_ui_mcp_settings_description`: "Model Context Protocol (MCP) servers provide additional capabilities to AI models. Configure which servers are available for AI interactions."

## Примеры использования

После установки пользователи могут давать AI следующие команды:

```
"Сделай скриншот google.com"
"Прочитай содержимое сайта example.com"
"Сделай скриншот главной страницы github.com"
```

## Установка и запуск

### Предварительные требования

1. Node.js >= 18.17.0
2. npm >= 9.0.0

### Шаги установки

1. **Клонирование репозитория**:
   ```bash
   git clone https://github.com/retailbox-automation/AI-experts-OS.git
   cd AI-experts-OS
   git checkout feature/puppeteer-mcp
   ```

2. **Установка зависимостей**:
   ```bash
   npm install
   ```

3. **Установка Puppeteer MCP сервера** (опционально, будет установлен автоматически через npx):
   ```bash
   npm install -g @modelcontextprotocol/server-puppeteer
   ```

4. **Запуск backend**:
   ```bash
   npm run backend:dev
   ```

5. **Запуск frontend** (в отдельном терминале):
   ```bash
   npm run frontend:dev
   ```

### Настройка

1. Зайдите в приложение как администратор
2. Перейдите в **Settings** → **General**
3. Найдите секцию **MCP Settings**
4. Убедитесь что Puppeteer MCP включен

## Тестирование

Для проверки корректности интеграции запустите:

```bash
node test_puppeteer_mcp.js
```

Скрипт проверит:
- Корректность конфигурации librechat.yaml
- Доступность пакета @modelcontextprotocol/server-puppeteer
- Наличие UI компонентов
- Корректность локализации

## Безопасность

- MCP серверы могут быть включены/выключены только администраторами
- Timeout операций установлен на 5 минут для предотвращения зависания
- Используется официальный пакет @modelcontextprotocol/server-puppeteer

## Устранение неполадок

### Проблема: Пакет не найден

```bash
npm install -g @modelcontextprotocol/server-puppeteer
```

### Проблема: UI компонент не отображается

Убедитесь что:
1. Вы зашли как администратор
2. Frontend пересобран после изменений
3. Кэш браузера очищен

### Проблема: Timeout ошибки

Увеличьте значение `timeout` в конфигурации librechat.yaml для медленных операций.

## Техническая архитектура

```
AI User Request
      ↓
LibreChat Backend
      ↓
MCP Client (встроенный)
      ↓
Puppeteer MCP Server (npx)
      ↓
Puppeteer/Chromium
      ↓
Web Target
```

## Дальнейшее развитие

Планируемые улучшения:
1. Поддержка дополнительных MCP серверов
2. Расширенные настройки для каждого сервера
3. Логирование операций MCP
4. Интеграция с файловой системой MCP

## Автор

Интеграция выполнена в рамках проекта AI-Experts OS.

## Лицензия

Соответствует лицензии основного проекта LibreChat. 