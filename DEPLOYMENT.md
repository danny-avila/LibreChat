# LibreChat Enhanced Content Rendering - Deployment Guide

## Przegląd

Ten dokument opisuje jak wdrożyć LibreChat z funkcją Enhanced Content Rendering na produkcję.

## Wymagania

- Docker i Docker Compose
- Node.js 18+ (dla lokalnego buildowania)
- Minimum 4GB RAM
- 10GB wolnego miejsca na dysku

## Struktura Projektu

```
LibreChat/
├── client/src/components/Chat/Messages/Content/enhanced/  # Komponenty enhanced content
├── docker-compose.override.yml                           # Konfiguracja development
├── docker-compose.yml                                    # Konfiguracja bazowa
├── .env                                                  # Zmienne środowiskowe
└── librechat.yaml                                        # Konfiguracja LibreChat
```

## Deployment na Produkcję

### 1. Przygotowanie Środowiska

```bash
# Sklonuj repozytorium
git clone <your-repo>
cd LibreChat

# Skopiuj przykładową konfigurację
cp .env.example .env
```

### 2. Konfiguracja Zmiennych Środowiskowych

Edytuj plik `.env` i ustaw:

```bash
# Podstawowe ustawienia
HOST=0.0.0.0
PORT=3080
NODE_ENV=production

# Baza danych MongoDB
MONGO_URI=mongodb://chat-mongodb:27017/LibreChat

# Klucze API (ustaw swoje)
OPENAI_API_KEY=your_openai_key
GOOGLE_KEY=your_google_key
ANTHROPIC_API_KEY=your_anthropic_key

# Enhanced Content Rendering
ENHANCED_CONTENT_ENABLED=true
```

### 3. Build Aplikacji

```bash
# Zainstaluj zależności
npm install

# Zbuduj frontend z enhanced content
npm run frontend

# Sprawdź czy build się powiódł
ls -la client/dist/
```

### 4. Konfiguracja Docker Compose dla Produkcji

Utwórz `docker-compose.prod.yml`:

```yaml
services:
  api:
    image: ghcr.io/danny-avila/librechat-dev:latest
    volumes:
      # Mount zbudowanego frontendu
      - type: bind
        source: ./client/dist
        target: /app/client/dist
        read_only: true
      # Mount konfiguracji
      - type: bind
        source: ./librechat.yaml
        target: /app/librechat.yaml
        read_only: true
      # Mount zmian backendowych (jeśli są)
      - type: bind
        source: ./api
        target: /app/api
        read_only: true
    environment:
      - NODE_ENV=production
    ports:
      - "${PORT}:${PORT}"
    command: npm run backend
    restart: unless-stopped
    depends_on:
      - chat-mongodb
      - rag_api
      - chat-meilisearch
      - vectordb
```

### 5. Uruchomienie na Produkcji

```bash
# Uruchom z konfiguracją produkcyjną
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Sprawdź logi
docker-compose logs -f api

# Sprawdź status kontenerów
docker-compose ps
```

### 6. Weryfikacja Deployment

```bash
# Sprawdź czy aplikacja odpowiada
curl -I http://localhost:3080

# Sprawdź czy enhanced content jest dostępny
curl -s http://localhost:3080 | grep -i "enhanced"

# Sprawdź logi pod kątem błędów
docker-compose logs api | grep -i error
```

## Konfiguracja Enhanced Content

### Włączenie Funkcji

W pliku `librechat.yaml`:

```yaml
# Enhanced Content Rendering Configuration
interface:
  enhancedContent:
    enabled: true
    features:
      - multimedia
      - charts
      - tts
      - widgets
      - codeExecution
```

### Dostępne Funkcje

1. **Multimedia Rendering** - Automatyczne wyświetlanie obrazów, wideo, audio
2. **Text-to-Speech** - Synteza mowy z wiadomości
3. **Charts** - Renderowanie wykresów z danych
4. **Widgets** - Interaktywne komponenty React/HTML
5. **Code Execution** - Podgląd i uruchamianie kodu

### Przykłady Użycia

Agent może używać następujących znaczników:

```markdown
# Obraz
https://example.com/image.jpg

# TTS
[tts:pl-PL]Tekst do przeczytania[/tts]

# Wykres
[chart:bar]
{
  "labels": ["A", "B", "C"],
  "data": [10, 20, 30]
}
[/chart]

# Widget
[widget:react]
function MyWidget() {
  return <div>Hello World!</div>;
}
[/widget]

# Kod do uruchomienia
[run:python]
print("Hello from Python!")
[/run]
```

## Monitoring i Maintenance

### Logi

```bash
# Logi aplikacji
docker-compose logs -f api

# Logi bazy danych
docker-compose logs -f chat-mongodb

# Wszystkie logi
docker-compose logs -f
```

### Backup

```bash
# Backup bazy danych
docker exec chat-mongodb mongodump --out /backup

# Backup konfiguracji
tar -czf librechat-config-backup.tar.gz .env librechat.yaml
```

### Updates

```bash
# Pull najnowszych obrazów
docker-compose pull

# Restart z nowymi obrazami
docker-compose up -d

# Rebuild frontendu po zmianach
npm run frontend
docker-compose restart api
```

## Troubleshooting

### Problemy z Enhanced Content

1. **Komponenty nie ładują się**
   ```bash
   # Sprawdź czy frontend został zbudowany
   ls -la client/dist/assets/
   
   # Sprawdź logi przeglądarki
   # Otwórz DevTools -> Console
   ```

2. **TTS nie działa**
   ```bash
   # Sprawdź czy przeglądarka obsługuje Web Speech API
   # Sprawdź czy HTTPS jest włączone (wymagane dla TTS)
   ```

3. **Wykresy nie renderują się**
   ```bash
   # Sprawdź format danych w logach
   docker-compose logs api | grep -i chart
   ```

### Problemy z Performance

1. **Wolne ładowanie**
   - Zwiększ pamięć kontenera
   - Włącz kompresję gzip
   - Użyj CDN dla statycznych plików

2. **Wysokie użycie CPU**
   - Sprawdź czy wszystkie komponenty są zoptymalizowane
   - Rozważ użycie Redis dla cache'owania

## Bezpieczeństwo

### Zalecenia

1. **HTTPS** - Zawsze używaj HTTPS na produkcji
2. **Firewall** - Ogranicz dostęp do portów
3. **Updates** - Regularnie aktualizuj zależności
4. **Monitoring** - Monitoruj logi pod kątem podejrzanej aktywności

### Konfiguracja HTTPS

```yaml
# nginx.conf
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Support

W przypadku problemów:

1. Sprawdź logi: `docker-compose logs -f`
2. Sprawdź dokumentację: `docs/`
3. Sprawdź GitHub Issues
4. Skontaktuj się z zespołem

## Changelog

- **v1.0.0** - Pierwsza wersja Enhanced Content Rendering
  - Multimedia rendering
  - Text-to-Speech
  - Charts support
  - Widget system
  - Code execution preview