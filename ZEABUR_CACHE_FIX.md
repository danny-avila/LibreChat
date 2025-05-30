# Zeabur Cache Issues - Solutions Guide

## Проблема
При обновлении кода через GitHub, Zeabur использует закешированные Docker слои, что приводит к неудачным сборкам. При этом новый сервис с тем же коммитом собирается успешно.

## Решения

### 1. Оптимизированный Dockerfile (уже применено)
- ✅ Разделение копирования package.json файлов для лучшего кеширования
- ✅ Добавлен `ARG CACHE_BUST` для принудительной инвалидации кеша
- ✅ Очистка npm cache перед установкой зависимостей

### 2. Принудительная инвалидация кеша через zeabur.json
Добавьте в `zeabur.json` build args:

```json
{
  "build": {
    "type": "docker",
    "dockerfile": "Dockerfile",
    "args": {
      "CACHE_BUST": "${ZEABUR_BUILD_ID}"
    }
  }
}
```

### 3. Использование zbpack.json для управления кешем
В файле `zbpack.json` можно настроить стратегию кеширования:

```json
{
  "build_command": "docker build --no-cache -f Dockerfile .",
  "cache": {
    "enabled": false
  }
}
```

### 4. Быстрые решения (workarounds)

#### A. Через Zeabur Dashboard:
1. Перейдите в настройки сервиса
2. Найдите "Build Configuration"
3. Добавьте переменную окружения: `DOCKER_BUILDKIT=1`
4. Добавьте build arg: `CACHE_BUST` со значением `${ZEABUR_BUILD_ID}`

#### B. Временное решение - форсированный редеплой:
1. В Zeabur dashboard нажмите "Redeploy"
2. Выберите опцию "Force rebuild" (если доступна)
3. Или удалите и создайте сервис заново

#### C. Альтернативный Dockerfile:
Создайте `Dockerfile.nocache` с директивой:
```dockerfile
# Добавьте в начало файла
ARG BUILDKIT_INLINE_CACHE=0
```

### 5. Скрипт для автоматической очистки кеша

Создайте файл `.github/workflows/zeabur-deploy.yml`:

```yaml
name: Deploy to Zeabur
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Update CACHE_BUST
        run: |
          echo "CACHE_BUST=$(date +%s)" >> $GITHUB_ENV
          
      - name: Trigger Zeabur Deploy
        run: |
          curl -X POST https://api.zeabur.com/deploy \
            -H "Authorization: Bearer ${{ secrets.ZEABUR_TOKEN }}" \
            -d '{"cache_bust": "'$CACHE_BUST'"}'
```

### 6. Проверка логов для диагностики

При проблемах с кешем проверьте:
```bash
# В логах сборки ищите:
- "Using cache" - указывает на использование кеша
- "CACHED" - слои взяты из кеша
- "npm install" время выполнения < 10 сек = вероятно из кеша
```

### 7. Превентивные меры

1. **Версионирование зависимостей:**
   - Используйте точные версии в package.json
   - Регулярно обновляйте package-lock.json

2. **Мониторинг:**
   - Следите за временем сборки
   - Если сборка < 2 минут = вероятно кеш

3. **Регулярная очистка:**
   - Раз в неделю делайте force rebuild
   - При major обновлениях всегда очищайте кеш

## Контакты поддержки Zeabur

Если проблема повторяется:
- Discord: https://discord.gg/zeabur
- Email: support@zeabur.com
- Укажите Service ID и Build ID

## Статус
🟡 **Требует тестирования после применения изменений** 