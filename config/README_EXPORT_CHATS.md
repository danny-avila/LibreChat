# 📄 Exportación de Conversaciones

Este documento explica cómo usar los nuevos comandos para exportar conversaciones de LibreChat.

## 🚀 Comandos Disponibles

### 1. Exportar Conversaciones de un Usuario Específico

```bash
# Desde la carpeta del proyecto
cd api

# Exportar en formato CSV (por defecto)
npm run export-user-chats usuario@ejemplo.com

# Exportar en formato JSON
npm run export-user-chats usuario@ejemplo.com json

# Especificar archivo de salida personalizado
npm run export-user-chats usuario@ejemplo.com csv mis_conversaciones.csv

# Modo interactivo (solicita el email)
npm run export-user-chats
```

### 2. Exportar TODAS las Conversaciones

```bash
# Exportar todas en CSV (por defecto)
npm run export-all-chats

# Exportar todas en JSON
npm run export-all-chats json

# Especificar archivo de salida
npm run export-all-chats csv backup_completo.csv
```

## 📋 Formatos de Salida

### Formato CSV
- **Usuario específico:** `conversaciones_{email}.csv`
- **Todos:** `todas_conversaciones_{fecha}.csv`
- Perfecto para Excel/Google Sheets
- Un mensaje por fila
- Fácil de filtrar y analizar

### Formato JSON
- **Usuario específico:** `conversaciones_{email}.json`
- **Todos:** `todas_conversaciones_{fecha}.json`
- Estructura jerárquica completa
- Ideal para backups y procesamiento programático
- Incluye metadatos completos

## 📊 Estructura de Datos

### CSV - Usuario Específico
```csv
userEmail,conversationId,conversationTitle,sender,text,isCreatedByUser,error,unfinished,messageId,parentMessageId,createdAt
usuario@ejemplo.com,abc-123,"Mi Conversación",User,"Hola, ¿cómo estás?",true,false,false,msg-001,,2025-07-15T10:30:00.000Z
usuario@ejemplo.com,abc-123,"Mi Conversación",Asistente Virtual,"¡Hola! Estoy bien...",false,false,false,msg-002,msg-001,2025-07-15T10:30:15.000Z
```

### CSV - Todos los Usuarios
```csv
userEmail,userName,conversationId,conversationTitle,sender,text,isCreatedByUser,error,unfinished,messageId,parentMessageId,createdAt
usuario1@ejemplo.com,"Juan Pérez",abc-123,"Consulta",User,"Mi pregunta",true,false,false,msg-001,,2025-07-15T10:30:00.000Z
usuario2@ejemplo.com,"María García",def-456,"Soporte",User,"Necesito ayuda",true,false,false,msg-002,,2025-07-15T11:00:00.000Z
```

### JSON - Usuario Específico
```json
{
  "userEmail": "usuario@ejemplo.com",
  "exportDate": "2025-07-15T12:00:00.000Z",
  "totalConversations": 5,
  "totalMessages": 42,
  "conversations": [
    {
      "conversationId": "abc-123",
      "title": "Mi Conversación",
      "createdAt": "2025-07-15T10:30:00.000Z",
      "updatedAt": "2025-07-15T10:45:00.000Z",
      "messageCount": 8,
      "messages": [
        {
          "messageId": "msg-001",
          "sender": "User",
          "text": "Hola, ¿cómo estás?",
          "isCreatedByUser": true,
          "createdAt": "2025-07-15T10:30:00.000Z",
          "parentMessageId": ""
        }
      ]
    }
  ]
}
```

## ⚡ Características

✅ **Manejo de errores robusto** - Gestiona errores de conexión y datos  
✅ **Validación de entrada** - Verifica emails y formatos  
✅ **Búsqueda inteligente** - Sugiere usuarios disponibles si no se encuentra el email  
✅ **Progreso visual** - Muestra el progreso de la exportación  
✅ **Resumen detallado** - Estadísticas completas al finalizar  
✅ **Archivos limpos** - Texto formateado correctamente para CSV  
✅ **Metadatos completos** - Incluye fechas, IDs y relaciones entre mensajes  

## 📝 Ejemplos de Uso

### Exportar Usuario Específico
```bash
# Ejemplo básico
cd api
npm run export-user-chats echev.test1@gmail.com

# Resultado: conversaciones_echev_test1_at_gmail_com.csv
```

### Backup Completo
```bash
# Exportar todo en JSON para backup
cd api
npm run export-all-chats json backup_librechat_2025-07-15.json

# Resultado: archivo JSON con todas las conversaciones de todos los usuarios
```

### Análisis de Datos
```bash
# Exportar todo en CSV para análisis
cd api
npm run export-all-chats csv datos_para_analisis.csv

# Abrir en Excel para crear gráficos y estadísticas
```

## 🔧 Solución de Problemas

### Error: Usuario no encontrado
- Verifica que el email sea correcto
- El comando muestra usuarios disponibles automáticamente

### Error: Sin conversaciones
- El usuario puede no tener conversaciones aún
- Verifica que el usuario haya usado la aplicación

### Error: Permisos de archivo
- Asegúrate de tener permisos de escritura en la carpeta
- Cierra cualquier archivo CSV que esté abierto en Excel

### Error: Conexión a base de datos
- Verifica que Docker esté ejecutándose
- Comprueba que el contenedor `chat-mongodb` esté activo

## 🛠️ Integración

Estos comandos siguen el mismo patrón que otros comandos de LibreChat:
- `npm run invite-user`
- `npm run list-users`
- `npm run user-stats`

Están completamente integrados al sistema de configuración existente y utilizan las mismas conexiones y validaciones.

---

**💡 Tip:** Para procesar grandes cantidades de datos, usa el formato JSON que es más eficiente. Para análisis rápidos, usa CSV que es más fácil de manipular en herramientas como Excel. 