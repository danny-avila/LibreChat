# Guia de Desplegament - LibreChat

## Requisits del servidor

- Docker i Docker Compose instal·lats
- NVIDIA GPU amb drivers i NVIDIA Container Toolkit (per Ollama)
- Mínim 8GB RAM (16GB recomanat)
- 50GB espai en disc

## Instal·lació ràpida

```bash
# 1. Clonar el repositori
git clone <url-del-repo> librechat
cd librechat

# 2. Executar el setup
./setup.sh

# 3. Crear el primer usuari admin
docker compose -f docker-compose.server.yml exec api npm run create-user

# 4. Descarregar models d'Ollama (opcional)
docker exec -it ollama ollama pull llama3.2
docker exec -it ollama ollama pull qwen2.5
docker exec -it ollama ollama pull deepseek-r1
```

## Configuració detallada

### 1. Fitxer .env

Copia `.env.template` a `.env` i configura:

```bash
cp .env.template .env
nano .env
```

**Variables importants:**

- `DOMAIN_CLIENT` i `DOMAIN_SERVER`: El teu domini públic (ex: `https://chat.exemple.com`)
- `QWEN_API_KEY`: API key de DashScope (Alibaba Cloud)
- `DEEPSEEK_API_KEY`: API key de DeepSeek
- `ANTHROPIC_API_KEY`: API key d'Anthropic (o `user_provided` perquè els usuaris posin la seva)
- `ZHIPU_API_KEY`: API key de Zhipu AI

**SMTP (opcional):**

```bash
EMAIL_HOST=smtp.exemple.com
EMAIL_PORT=587
EMAIL_ENCRYPTION=starttls
EMAIL_USERNAME=usuari@exemple.com
EMAIL_PASSWORD=contrasenya
EMAIL_FROM=noreply@exemple.com
EMAIL_FROM_NAME=LibreChat
```

### 2. Fitxer librechat.yaml

Copia `librechat.template.yaml` a `librechat.yaml`:

```bash
cp librechat.template.yaml librechat.yaml
nano librechat.yaml
```

**Cloudflare Turnstile (opcional):**

```yaml
turnstile:
  siteKey: "LA_TEVA_SITE_KEY"
  options:
    language: "ca"
    size: "normal"
```

### 3. Apache2 Reverse Proxy

```bash
# Instal·lar mòduls necessaris
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers
sudo systemctl restart apache2

# Copiar configuració
sudo cp docs/apache2.conf.example /etc/apache2/sites-available/librechat.conf
sudo nano /etc/apache2/sites-available/librechat.conf

# Activar i recarregar
sudo a2ensite librechat
sudo systemctl reload apache2
```

**Important:** Al `.env`, configura `TRUST_PROXY=1` i els dominis reals.

### 4. SSL amb Let's Encrypt (opcional)

```bash
sudo apt install certbot python3-certbot-apache
sudo certbot --apache -d chat.exemple.com
```

## Gestió d'usuaris

### Crear usuaris (només admin)

Amb `ALLOW_REGISTRATION=false`, només l'admin pot crear usuaris:

```bash
# Crear usuari directament
docker compose -f docker-compose.server.yml exec api npm run create-user

# Convidar usuari per email
docker compose -f docker-compose.server.yml exec api npm run invite-user usuari@exemple.com
```

### Llistar usuaris

```bash
docker compose -f docker-compose.server.yml exec api npm run list-users
```

### Eliminar usuari

```bash
docker compose -f docker-compose.server.yml exec api npm run delete-user
```

## Models d'Ollama

### Descarregar models

```bash
docker exec -it ollama ollama pull <model>
```

**Models recomanats per RTX 4060 (8GB VRAM):**

- `llama3.2` (3B) - Ràpid i eficient
- `qwen2.5` (7B) - Bon rendiment general
- `deepseek-r1` (7B) - Raonament avançat
- `mistral` (7B) - Equilibrat
- `codellama` (7B) - Especialitzat en codi

### Actualitzar la llista de models al librechat.yaml

Edita `librechat.yaml` i actualitza la secció d'Ollama:

```yaml
- name: 'Ollama'
  apiKey: 'ollama'
  baseURL: 'http://ollama:11434/v1/'
  models:
    default:
      - 'llama3.2'
      - 'qwen2.5'
      - 'deepseek-r1'
      # Afegeix els models que hagis descarregat
    fetch: true
```

## Generació d'imatges

### Qwen Image (qwen-image-2.0-pro)

Ja configurat via MCP server. Els usuaris poden generar imatges demanant-ho als agents.

### Stable Diffusion (opcional)

Si vols Stable Diffusion local:

1. Instal·la [AUTOMATIC1111 WebUI](https://github.com/AUTOMATIC1111/stable-diffusion-webui)
2. Afegeix al `.env`:

```bash
SD_WEBUI_URL=http://host.docker.internal:7860
```

## Manteniment

### Actualitzar LibreChat

```bash
git pull
docker compose -f docker-compose.server.yml pull
docker compose -f docker-compose.server.yml up -d --build
```

### Backup de dades

```bash
# Backup MongoDB
docker exec chat-mongodb mongodump --out /backup
docker cp chat-mongodb:/backup ./backup-mongodb

# Backup uploads
tar -czf backup-uploads.tar.gz uploads/
```

### Logs

```bash
# Veure logs de LibreChat
docker compose -f docker-compose.server.yml logs -f api

# Veure logs d'Ollama
docker logs -f ollama
```

## Troubleshooting

### Ollama no detecta la GPU

```bash
# Verificar NVIDIA Container Toolkit
nvidia-smi
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

### Error de permisos

```bash
# Assegurar-se que els directoris tenen els permisos correctes
sudo chown -R 1000:1000 data-node meili_data uploads logs
```

### Port 3080 ocupat

Canvia el port al `.env`:

```bash
PORT=3081
```

I actualitza Apache2 per apuntar al nou port.

## Suport

- Documentació oficial: https://librechat.ai/docs
- GitHub: https://github.com/danny-avila/LibreChat
- Discord: https://discord.librechat.ai
