# 🚀 Ejemplo Completo - Exportación Manual en Mongosh

Este documento muestra el ejemplo **que funcionó perfectamente** para exportar conversaciones de un usuario específico usando mongosh directamente.

## 📋 Pasos Ejecutados

### 1. Conectar a MongoDB
```bash
docker exec -it chat-mongodb mongosh LibreChat
```

### 2. Verificar la Estructura de Conversaciones
```javascript
// Ver estructura de una conversación
db.conversations.findOne()
```

**Resultado:**
```javascript
{
  _id: ObjectId('68491f6677863f68b2a823f9'),
  conversationId: 'e84c42e5-7868-49f5-8ff9-d782ad3761df',
  user: '6849110dc4917c967ca13660',  // ⚠️ IMPORTANTE: Es STRING, no ObjectId
  __v: 0,
  _meiliIndex: true,
  agent_id: 'agent_4BBHUYodzY0FBw4m2fJ3g',
  createdAt: ISODate('2025-06-11T06:17:10.646Z'),
  endpoint: 'agents',
  title: 'Conoce a AVI',
  // ... más campos
}
```

### 3. Script Completo que Funcionó ✅

```javascript
// === SCRIPT DE EXPORTACIÓN COMPLETO ===
const email = "echev.test1@gmail.com";
const user = db.users.findOne({email: email});

if (user) {
    const conversations = db.conversations.find({user: user._id.toString()}).toArray();
    
    print("🎯 INICIANDO EXPORTACIÓN");
    print("Usuario: " + user.email);
    print("Conversaciones: " + conversations.length);
    print("");
    
    // ENCABEZADO CSV
    print("=".repeat(80));
    print("COPIA DESDE LA SIGUIENTE LÍNEA PARA TU ARCHIVO CSV:");
    print("=".repeat(80));
    print("userEmail,conversationId,conversationTitle,sender,text,isCreatedByUser,error,unfinished,messageId,parentMessageId,createdAt");

    let totalMessages = 0;

    conversations.forEach((conv, convIndex) => {
        // Obtener mensajes de esta conversación
        const messages = db.messages.find({
            conversationId: conv.conversationId
        }).sort({createdAt: 1}).toArray();

        print(""); // Línea en blanco entre conversaciones (como comentario)
        print("# Conversación " + (convIndex + 1) + ": " + conv.title + " (" + messages.length + " mensajes)");

        messages.forEach(msg => {
            // Extraer texto
            let text = msg.text || '';
            if (!text && msg.content && Array.isArray(msg.content)) {
                text = msg.content
                    .filter(item => item.type === 'text')
                    .map(item => item.text)
                    .join(' ');
            }

            // Limpiar texto para CSV
            text = text.replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/"/g, '""');

            // Crear fila CSV
            const csvRow = [
                user.email,
                conv.conversationId,
                '"' + (conv.title || 'Sin título').replace(/"/g, '""') + '"',
                msg.sender || '',
                '"' + text + '"',
                msg.isCreatedByUser || false,
                msg.error || false,
                msg.unfinished || false,
                msg.messageId,
                msg.parentMessageId || '',
                msg.createdAt ? msg.createdAt.toISOString() : ''
            ].join(',');

            print(csvRow);
            totalMessages++;
        });
    });

    print("=".repeat(80));
    print("✅ EXPORTACIÓN COMPLETADA");
    print("📊 RESUMEN:");
    print("   • Usuario: " + user.email);
    print("   • Total conversaciones: " + conversations.length);
    print("   • Total mensajes: " + totalMessages);
    print("   • Fecha de exportación: " + new Date().toISOString());
    print("=".repeat(80));
}
```

## 📄 Resultado Obtenido

### Encabezado y Datos
```csv
userEmail,conversationId,conversationTitle,sender,text,isCreatedByUser,error,unfinished,messageId,parentMessageId,createdAt

# Conversación 1: Mensaje de prueba y AVI (4 mensajes)
echev.test1@gmail.com,7a9d0f15-e549-4c36-b34d-f0a5a07b44fe,"Mensaje de prueba y AVI",User,"mensaje de prueba 1.1",true,false,false,08cf0a49-7109-4558-a422-91f3fae07fa9,00000000-0000-0000-0000-000000000000,2025-07-15T07:43:06.766Z

echev.test1@gmail.com,7a9d0f15-e549-4c36-b34d-f0a5a07b44fe,"Mensaje de prueba y AVI",Asistente Virtual en Infancia,"¡Hola! Mensaje recibido. Soy AVI, Asistente Virtual en Infancia, aquí para apoyar el trabajo de los equipos residenciales con niños, niñas y adolescentes...",false,false,false,38184f7c-5866-40aa-9b9b-191326abebcd,08cf0a49-7109-4558-a422-91f3fae07fa9,2025-07-15T07:43:11.076Z

# Conversación 2: Mensaje de prueba recibido (4 mensajes)
echev.test1@gmail.com,ebfdc552-4a01-45eb-916e-8f6c314e64c9,"Mensaje de prueba recibido",User,"mensaje de prueba 2.1",true,false,false,3dec4973-aeaa-4471-ba0a-96f6d9de0909,00000000-0000-0000-0000-000000000000,2025-07-15T07:44:07.165Z

echev.test1@gmail.com,ebfdc552-4a01-45eb-916e-8f6c314e64c9,"Mensaje de prueba recibido",Asistente Virtual en Infancia,"¡Hola! Recibido tu mensaje de prueba 2.1. Estoy aquí y listo para apoyar el trabajo en la residencia...",false,false,false,4678c86a-9b30-48c7-ac50-e0b992c5803c,3dec4973-aeaa-4471-ba0a-96f6d9de0909,2025-07-15T07:44:13.052Z
```

### Resumen Final
```
✅ EXPORTACIÓN COMPLETADA
📊 RESUMEN:
   • Usuario: echev.test1@gmail.com
   • Total conversaciones: 2
   • Total mensajes: 8
   • Fecha de exportación: 2025-07-15T08:21:19.922Z
```

## 🔑 Puntos Clave del Éxito

1. **Campo `user` es STRING**: `user: '6849110dc4917c967ca13660'` (no ObjectId)
2. **Conversión necesaria**: `user._id.toString()` para comparar correctamente
3. **Ordenamiento por fecha**: `.sort({createdAt: 1})` para cronología correcta
4. **Extracción de texto**: Manejo de `msg.text` y `msg.content[]`
5. **Limpieza CSV**: Escape de comillas y saltos de línea
6. **Estructura relacional**: `conversationId` conecta mensajes con conversaciones

## 🎯 Uso Recomendado

1. **Para uso ocasional**: Usar este script directamente en mongosh
2. **Para uso frecuente**: Usar los comandos npm creados:
   ```bash
   cd api
   npm run export-user-chats echev.test1@gmail.com
   ```

## 📝 Notas Importantes

- ✅ **Funciona perfecto** para exportación manual rápida
- ✅ **Datos limpios** listos para análisis
- ✅ **Formato CSV estándar** compatible con Excel/Google Sheets
- ⚠️ **Copiar/pegar manual** desde la consola de mongosh
- ⚠️ **Filtrar comentarios** al guardar el CSV (líneas que empiezan con #) 