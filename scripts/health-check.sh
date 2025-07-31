#!/bin/bash
set -e

echo "🚀 Iniciando Health Check Audit LibreChat - $(date)"

# Cambiar al directorio de la API
cd /app/api

# Ejecutar health check completo con notificaciones por email
echo "📧 Ejecutando Health Check con notificaciones..."
npm run health-check-audit

exit_code=$?

if [ $exit_code -eq 0 ]; then
    echo "✅ Health Check completado exitosamente - $(date)"
    echo "📧 Notificación de éxito enviada por email"
else
    echo "❌ Health Check falló con código: $exit_code - $(date)"
    echo "📧 Notificación de error enviada por email"
fi

echo "🏁 Health Check Audit finalizado - $(date)"
exit $exit_code 