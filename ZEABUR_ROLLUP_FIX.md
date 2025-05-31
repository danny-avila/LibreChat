# Исправление проблемы с Rollup на Zeabur

## Проблема

При сборке Docker-образа на Zeabur возникает ошибка:
```
Error: Cannot find module @rollup/rollup-linux-x64-musl
```

## Причина

- Zeabur использует Alpine Linux для сборки
- Rollup v4.x требует платформо-специфичные бинарные файлы
- npm имеет известную проблему с опциональными зависимостями на Alpine Linux

## Решение

Dockerfile уже обновлен с необходимыми исправлениями:

1. **Установка с флагом --ignore-scripts**
2. **Явная установка платформо-специфичной зависимости**
3. **Пересборка нативных модулей**

## Изменения в Dockerfile

```dockerfile
# Было:
npm install --no-audit --frozen-lockfile;

# Стало:
npm install --no-audit --frozen-lockfile --ignore-scripts ;
npm install @rollup/rollup-linux-x64-musl --save-optional --no-audit ;
npm rebuild ;
npm run postinstall || true ;
```

## Развертывание на Zeabur

1. **Сделайте commit изменений:**
   ```bash
   git add Dockerfile
   git commit -m "Fix: Add rollup Alpine Linux dependency for Zeabur build"
   git push
   ```

2. **Очистите кэш сборки на Zeabur:**
   - Перейдите в настройки проекта на Zeabur
   - Найдите опцию "Clear Build Cache" или аналогичную
   - Очистите кэш

3. **Перезапустите сборку:**
   - Нажмите "Redeploy" или "Rebuild"
   - Следите за логами сборки

## Альтернативный вариант - Multi-stage Dockerfile

Если основной Dockerfile не работает, можно использовать multi-stage версию:

1. Обновите `zeabur.json`:
   ```json
   {
     "build": {
       "type": "docker",
       "dockerfile": "Dockerfile.multi",
       ...
     }
   }
   ```

2. Сделайте commit и push изменений

## Проверка

После успешной сборки вы должны увидеть в логах:
- Успешную установку `@rollup/rollup-linux-x64-musl`
- Успешную сборку пакетов data-provider, mcp и data-schemas
- Успешную сборку клиента

## Дополнительные настройки

Если проблема сохраняется:

1. **Увеличьте память для сборки** в `zeabur.json`:
   ```json
   {
     "build": {
       "memory": "8192Mi"
     }
   }
   ```

2. **Используйте другой базовый образ** (не Alpine):
   Измените в Dockerfile:
   ```dockerfile
   FROM node:20-slim AS node
   ```

## Поддержка

Если проблема сохраняется после этих изменений:
1. Проверьте логи сборки на Zeabur
2. Убедитесь, что используется правильный Dockerfile
3. Проверьте версию npm в образе (должна быть 8.x или выше) 