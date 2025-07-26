# 🔄 Sincronización Automática de Chats a Google Sheets

Esta guía te permitirá configurar la sincronización automática de todas las conversaciones de LibreChat a Google Sheets usando Docker y Dokploy.

## 📋 Índice
- [🎯 Objetivo](#-objetivo)
- [🏗️ Arquitectura del Flujo](#-arquitectura-del-flujo)
- [📁 Archivos Modificados/Creados](#-archivos-modificadoscreados)
- [⚙️ Pasos de Implementación](#-pasos-de-implementación)
- [🔧 Configuración de Google Sheets API](#-configuración-de-google-sheets-api)
- [🚀 Configuración en Dokploy](#-configuración-en-dokploy)
- [🧪 Pruebas y Verificación](#-pruebas-y-verificación)
- [🐛 Resolución de Problemas](#-resolución-de-problemas)

## 🎯 Objetivo

Automatizar la exportación diaria de **todas las conversaciones** de LibreChat a un Google Sheets, ejecutándose dentro del contenedor Docker sin dependencias externas.

### ✅ Características del Sistema
- **100% JavaScript** - Consistente con el stack del proyecto
- **Automático** - Ejecución programada via cron
- **Limpio** - Elimina archivos temporales automáticamente
- **Filtrado** - Excluye columnas innecesarias (`isCreatedByUser`, `unfinished`)
- **Robusto** - Manejo completo de errores

## 🏗️ Arquitectura del Flujo

```mermaid
graph TD
    A[🕐 Schedule: 2:00 AM] --> B[📝 Execute: /app/scripts/sync-chats.sh]
    B --> C[🔄 npm run sync-chats-to-sheets]
    C --> D[📤 npm run export-all-chats]
    D --> E[📄 Genera: chats.csv]
    E --> F[📊 npm run upload-to-sheets]
    F --> G[🔍 Lee CSV + Filtra columnas]
    G --> H[☁️ Actualiza Google Sheets]
    H --> I[🧹 Elimina chats.csv]
    I --> J[✅ Proceso completado]
```

## 📁 Archivos Modificados/Creados

### 🆕 Archivos Nuevos
```
├── config/upload-to-sheets.js    # Script para subir a Google Sheets
├── scripts/sync-chats.sh         # Script bash principal
└── README_SYNC_CHATS_SHEETS.md   # Esta guía
```

### ✏️ Archivos Modificados
```
├── config/export-all-chats.js    # Genera 'chats.csv' en lugar de timestamp
├── api/package.json              # Nuevos scripts + dependencia csv-parser
├── Dockerfile.multi              # Incluye scripts en la imagen
└── deploy-compose-dokploy.yml    # Simplificado (sin volúmenes extra)
```

## ⚙️ Pasos de Implementación

### 1. **Verificar Archivos del Proyecto**

Asegúrate de que todos los archivos estén en su lugar:

```bash
# Verificar archivos nuevos
ls -la config/upload-to-sheets.js
ls -la scripts/sync-chats.sh

# Verificar modificaciones
git status
```

### 2. **Rebuild de la Imagen Docker**

> **💡 Nota:** No necesitas instalar `csv-parser` localmente. La dependencia se instala automáticamente en la imagen Docker porque ya está incluida en `api/package.json`.

En Dokploy, ejecuta un **rebuild** de la imagen para incluir los nuevos scripts:

```bash
# En tu repositorio Git
git add .
git commit -m "feat: Add automatic chat sync to Google Sheets"
git push origin develop

# En Dokploy: Trigger rebuild from UI
```

## 🔧 Configuración de Google Sheets API

### 1. **Crear Proyecto en Google Cloud Console**

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita la **Google Sheets API**

### 2. **Crear Service Account**

1. Ve a **IAM & Admin** > **Service Accounts**
2. Clic en **Create Service Account**
3. Completa el formulario:
   - **Name:** `librechat-sheets-sync`
   - **Description:** `Service account for LibreChat Google Sheets sync`
4. Clic en **Create and Continue**
5. Asigna rol: **Editor** (o crea un rol custom con permisos de Sheets)
6. Clic en **Done**

### 3. **Generar Clave JSON**

1. Busca el service account creado
2. Clic en el email del service account
3. Ve a la pestaña **Keys**
4. Clic en **Add Key** > **Create new key**
5. Selecciona **JSON** y clic en **Create**
6. **Guarda el archivo JSON** - lo necesitarás para la configuración

### 4. **Configurar Google Sheets**

1. Crea un nuevo Google Sheets
2. Copia el **Spreadsheet ID** de la URL:
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
   ```
3. **Comparte el sheet** con el email del service account (con permisos de Editor)

### 5. **Configurar Variables de Entorno**

En tu archivo `../files/.env` de Dokploy, agrega:

```env
# Google Sheets Sync
GOOGLE_CREDENTIALS_JSON={"type":"service_account","project_id":"tu-proyecto","private_key_id":"xxx","private_key":"-----BEGIN PRIVATE KEY-----\nXXX\n-----END PRIVATE KEY-----\n","client_email":"librechat-sheets-sync@tu-proyecto.iam.gserviceaccount.com","client_id":"xxx","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/librechat-sheets-sync%40tu-proyecto.iam.gserviceaccount.com"}
GOOGLE_SHEETS_ID=1-bhyU4cglhQHp5Ls8_ZitUvA7onz-Tu0SUtKPV4Gfgc
```

**💡 Tip:** Copia todo el contenido del archivo JSON como una sola línea.



## 🚀 Configuración en Dokploy

### 1. **Redesplegar el Servicio**

1. Ve a tu proyecto en Dokploy
2. Selecciona el servicio **API**
3. Clic en **Redeploy** para aplicar los cambios del Dockerfile

### 2. **Configurar Schedule/Cron Job**

1. En el servicio **API**, busca la sección **"Cron Jobs"** o **"Schedules"**
2. Clic en **"Create Schedule"**
3. Configura los siguientes parámetros:

```yaml
Service Name: api
Task Name: Daily Chat Sync to Google Sheets
Schedule: 0 2 * * *
Shell Type: sh
Command: /app/scripts/sync-chats.sh
Enabled: ✅
```

### 3. **Explicación del Schedule**
- `0 2 * * *` = Ejecutar diariamente a las 2:00 AM
- Puedes modificar según tus necesidades:
  - `0 */6 * * *` = Cada 6 horas
  - `0 0 * * 0` = Solo los domingos a medianoche
  - `30 1 * * *` = Diariamente a las 1:30 AM

## 🧪 Pruebas y Verificación

### 1. **Prueba Manual**

Ejecuta el script manualmente para verificar que funcione:

```bash
# Conectarse al contenedor
docker exec -it LibreChat-API-local /bin/sh

# Ejecutar el script manualmente
/app/scripts/sync-chats.sh

# O ejecutar paso a paso
cd /app/api
npm run export-all-chats
npm run upload-to-sheets
```

### 2. **Verificar Logs**

```bash
# Ver logs del contenedor
docker logs <nombre_contenedor_api> -f

# Buscar errores específicos
docker logs <nombre_contenedor_api> 2>&1 | grep -i error
```

### 3. **Verificar Google Sheets**

1. Abre tu Google Sheets
2. Verifica que los datos se hayan actualizado
3. Comprueba que las columnas filtradas no aparezcan

### 4. **Verificar Cron Job**

En Dokploy UI:
1. Ve a **Schedules** del servicio API
2. Verifica que el job esté **Enabled**
3. Revisa el **Last Run** y **Next Run**

## 🐛 Resolución de Problemas

### ❌ Error: "GOOGLE_CREDENTIALS_JSON no encontrada"

**Solución:**
1. Verifica que la variable esté en el archivo `.env`
2. Asegúrate de que el JSON esté en una sola línea
3. Verifica que no haya caracteres especiales mal escapados

```bash
# Verificar variables de entorno en el contenedor
docker exec -it <container> env | grep GOOGLE
```

### ❌ Error: "Permission denied accessing Google Sheets"

**Solución:**
1. Verifica que el service account tenga permisos de **Editor**
2. Comprueba que el sheet esté compartido con el email del service account
3. Verifica que la variable `GOOGLE_SHEETS_ID` esté configurada correctamente en `.env`

### ❌ Error: "csv-parser module not found"

**Solución:**
1. Verifica que `csv-parser` esté en `api/package.json`
2. Ejecuta rebuild de la imagen Docker
3. Verifica que las dependencias se instalen correctamente

### ❌ Error: "chats.csv not found"

**Solución:**
1. Verifica que `export-all-chats` se ejecute correctamente
2. Comprueba que haya conversaciones en la base de datos
3. Verifica permisos de escritura en el directorio

### ❌ Cron Job no se ejecuta

**Solución:**
1. Verifica la sintaxis del cron: `0 2 * * *`
2. Comprueba que el script sea ejecutable: `chmod +x`
3. Verifica que la ruta sea correcta: `/app/scripts/sync-chats.sh`
4. Revisa logs del cron service en Dokploy

### 🔍 Debug Avanzado

Para debug detallado, modifica temporalmente el script:

```bash
# En sync-chats.sh, agregar debug
#!/bin/bash
set -x  # Debug mode
echo "🚀 Iniciando sincronización..."
echo "Current directory: $(pwd)"
echo "Date: $(date)"
cd /app/api
npm run sync-chats-to-sheets
```

## 📊 Monitoreo y Mantenimiento

### **Logs Recomendados**
- Revisa logs diariamente los primeros días
- Configura alertas si el proceso falla
- Monitorea el crecimiento del Google Sheets

### **Mantenimiento Periódico**
- Revisa la rotación de credenciales de Google (anualmente)
- Verifica que el Google Sheets no exceda límites de tamaño
- Considera archivado periódico de datos antiguos

### **Métricas a Monitorear**
- Tiempo de ejecución del script
- Cantidad de conversaciones exportadas
- Tamaño del archivo CSV generado
- Errores en la API de Google Sheets

---

## ✅ Checklist de Implementación

- [ ] ✅ Archivos creados/modificados
- [ ] ✅ Dependencias instaladas (`csv-parser`)
- [ ] ✅ Google Cloud Project configurado
- [ ] ✅ Service Account creado
- [ ] ✅ Clave JSON descargada
- [ ] ✅ Google Sheets creado y compartido
- [ ] ✅ Variables de entorno configuradas (GOOGLE_CREDENTIALS_JSON y GOOGLE_SHEETS_ID)
- [ ] ✅ Imagen Docker reconstruida
- [ ] ✅ Cron job configurado en Dokploy
- [ ] ✅ Prueba manual exitosa
- [ ] ✅ Verificación en Google Sheets

---

**🎉 ¡Listo!** Tu sistema de sincronización automática de chats a Google Sheets está funcionando.

Para soporte o mejoras, revisa los logs y consulta esta guía. El sistema está diseñado para ser robusto y requerir mínimo mantenimiento. 