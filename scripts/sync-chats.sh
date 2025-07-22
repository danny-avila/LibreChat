#!/bin/sh
# scripts/sync-chats.sh

echo "🚀 Iniciando sincronización de chats a Google Sheets..."

cd /app/api

# Ejecutar el flujo completo
npm run sync-chats-to-sheets

echo "✅ Sincronización completada!" 