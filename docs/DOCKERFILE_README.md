# Dockerfile - Руководство по использованию

## 📁 Структура Dockerfile в проекте

В папке `AI-experts-OS` есть два основных Dockerfile:

### 1. `Dockerfile` (Основной)
- **Использование**: Основной файл для сборки на Zeabur и локально
- **Особенности**: 
  - Исправлена проблема с rollup для Alpine Linux
  - Оптимизирован для production
  - Используется по умолчанию в `zeabur.json`

### 2. `Dockerfile.multi` (Multi-stage)
- **Использование**: Альтернативная версия с multi-stage сборкой
- **Особенности**:
  - Меньший размер финального образа
  - Раздельная сборка компонентов
  - Лучшее кэширование слоев

## 🚀 Какой использовать?

### Для Zeabur (по умолчанию):
```json
// zeabur.json
{
  "build": {
    "type": "docker",
    "dockerfile": "Dockerfile"
  }
}
```

### Для multi-stage сборки:
```json
// zeabur.json
{
  "build": {
    "type": "docker",
    "dockerfile": "Dockerfile.multi"
  }
}
```

## 🔧 Локальное тестирование

```bash
# Основной Dockerfile
docker build -f Dockerfile -t librechat:latest .

# Multi-stage Dockerfile
docker build -f Dockerfile.multi -t librechat:multi .

# Или используйте скрипт
./test-build.sh
```

## ⚠️ Важно

- НЕ используйте Dockerfile из родительской папки - они не содержат исправлений для Zeabur
- Оба Dockerfile в этой папке содержат исправление для rollup на Alpine Linux
- При проблемах со сборкой сначала очистите Docker cache: `docker system prune -a`

## 📝 Примечания

- `Dockerfile` - проще для отладки, все в одном контейнере
- `Dockerfile.multi` - эффективнее для production, меньше размер образа

Выбирайте исходя из ваших потребностей! 