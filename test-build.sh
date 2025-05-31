#!/bin/bash

echo "Тестирование Docker-сборки LibreChat..."
echo "======================================="

# Проверка наличия Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен!"
    exit 1
fi

# Сборка с основным Dockerfile
echo -e "\n📦 Сборка с основным Dockerfile..."
docker build -f Dockerfile -t librechat-test:main . 2>&1 | tee build-main.log

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo "✅ Основная сборка успешна!"
else
    echo "❌ Основная сборка провалилась!"
    echo "Проверьте файл build-main.log для деталей"
fi

# Опционально: сборка с multi-stage Dockerfile
read -p "Хотите протестировать multi-stage Dockerfile? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "\n📦 Сборка с multi-stage Dockerfile..."
    docker build -f Dockerfile.multi -t librechat-test:multi . 2>&1 | tee build-multi.log
    
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        echo "✅ Multi-stage сборка успешна!"
    else
        echo "❌ Multi-stage сборка провалилась!"
        echo "Проверьте файл build-multi.log для деталей"
    fi
fi

echo -e "\n📊 Результаты сборки:"
docker images | grep librechat-test

echo -e "\n✨ Тестирование завершено!" 