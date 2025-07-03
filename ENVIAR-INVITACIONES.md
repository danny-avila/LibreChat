# 📧 Enviar Invitaciones LibreChat

## 🎯 **Proceso Completo**

### 1. **Acceder al contenedor**
```bash
docker exec -it LibreChat-API-local /bin/sh
```

### 2. **Navegar al directorio correcto**
```bash
cd ..
```
> El contenedor inicia en `/app/api`, necesitas ir a `/app` donde están los archivos

### 3. **Verificar archivos disponibles**
```bash
ls
# Deberías ver: emails.txt, enviar-invitaciones.sh
```

### 4. **Limpiar y Editar lista de emails**
```bash
> emails.txt
vi emails.txt
```
**Comandos vi:**
- `i` → Entrar en modo edición
- Editar lista (un email por línea)
- `Esc` → Salir modo edición  
- `:x` → Guardar y salir

### 5. **Ejecutar script de invitaciones**
```bash
sh ./enviar-invitaciones.sh
```

### 6. **Salir del contenedor**
```bash
exit
```

## ⚠️ **Requisitos**
- Contenedor `LibreChat-API-local` corriendo
- Variables de entorno SMTP configuradas
- Archivos con line endings LF (no CRLF)

