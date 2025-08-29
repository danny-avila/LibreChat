#!/bin/bash

# LibreChat Enhanced Content Rendering - Deployment Script
# Użycie: ./deploy.sh [development|production]

set -e

# Kolory dla outputu
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funkcje pomocnicze
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Sprawdź argumenty
MODE=${1:-development}

if [[ "$MODE" != "development" && "$MODE" != "production" ]]; then
    log_error "Nieprawidłowy tryb. Użyj: development lub production"
    exit 1
fi

log_info "Rozpoczynam deployment w trybie: $MODE"

# Sprawdź wymagania
check_requirements() {
    log_info "Sprawdzam wymagania..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker nie jest zainstalowany"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose nie jest zainstalowany"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js nie jest zainstalowany"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "npm nie jest zainstalowany"
        exit 1
    fi
    
    log_success "Wszystkie wymagania spełnione"
}

# Sprawdź konfigurację
check_config() {
    log_info "Sprawdzam konfigurację..."
    
    if [[ ! -f ".env" ]]; then
        log_warning "Brak pliku .env, kopiuję z .env.example"
        if [[ -f ".env.example" ]]; then
            cp .env.example .env
        else
            log_error "Brak pliku .env.example"
            exit 1
        fi
    fi
    
    if [[ ! -f "librechat.yaml" ]]; then
        log_warning "Brak pliku librechat.yaml"
        if [[ -f "librechat.example.yaml" ]]; then
            cp librechat.example.yaml librechat.yaml
        fi
    fi
    
    log_success "Konfiguracja sprawdzona"
}

# Zainstaluj zależności
install_dependencies() {
    log_info "Instaluję zależności..."
    
    if [[ ! -d "node_modules" ]]; then
        npm install
    else
        log_info "Zależności już zainstalowane, pomijam..."
    fi
    
    log_success "Zależności zainstalowane"
}

# Zbuduj frontend
build_frontend() {
    log_info "Buduję frontend z Enhanced Content..."
    
    # Sprawdź czy enhanced content istnieje
    if [[ ! -d "client/src/components/Chat/Messages/Content/enhanced" ]]; then
        log_error "Brak komponentów Enhanced Content"
        exit 1
    fi
    
    # Build frontend
    npm run frontend
    
    # Sprawdź czy build się powiódł
    if [[ ! -d "client/dist" ]]; then
        log_error "Build frontendu nie powiódł się"
        exit 1
    fi
    
    log_success "Frontend zbudowany pomyślnie"
}

# Przygotuj konfigurację Docker
prepare_docker_config() {
    log_info "Przygotowuję konfigurację Docker..."
    
    if [[ "$MODE" == "production" ]]; then
        # Utwórz docker-compose.prod.yml jeśli nie istnieje
        if [[ ! -f "docker-compose.prod.yml" ]]; then
            log_info "Tworzę docker-compose.prod.yml..."
            cat > docker-compose.prod.yml << 'EOF'
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
      # Mount node_modules jako volume dla lepszej wydajności
      - /app/node_modules
      - /app/client/node_modules
      - /app/packages/data-provider/node_modules
      - /app/packages/data-schemas/node_modules
      - /app/packages/api/node_modules
      - /app/packages/client/node_modules
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
EOF
        fi
    fi
    
    log_success "Konfiguracja Docker przygotowana"
}

# Zatrzymaj istniejące kontenery
stop_containers() {
    log_info "Zatrzymuję istniejące kontenery..."
    
    if docker-compose ps -q | grep -q .; then
        docker-compose down
        log_success "Kontenery zatrzymane"
    else
        log_info "Brak działających kontenerów"
    fi
}

# Uruchom kontenery
start_containers() {
    log_info "Uruchamiam kontenery w trybie $MODE..."
    
    if [[ "$MODE" == "production" ]]; then
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
    else
        docker-compose up -d
    fi
    
    log_success "Kontenery uruchomione"
}

# Sprawdź status deployment
check_deployment() {
    log_info "Sprawdzam status deployment..."
    
    # Poczekaj na uruchomienie
    sleep 10
    
    # Sprawdź czy kontenery działają
    if ! docker-compose ps | grep -q "Up"; then
        log_error "Kontenery nie uruchomiły się poprawnie"
        docker-compose logs --tail=50
        exit 1
    fi
    
    # Sprawdź czy aplikacja odpowiada
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:3080 | grep -q "200"; then
            log_success "Aplikacja działa poprawnie na http://localhost:3080"
            break
        fi
        
        log_info "Próba $attempt/$max_attempts - czekam na uruchomienie aplikacji..."
        sleep 2
        ((attempt++))
    done
    
    if [[ $attempt -gt $max_attempts ]]; then
        log_error "Aplikacja nie uruchomiła się w oczekiwanym czasie"
        log_info "Sprawdź logi: docker-compose logs -f"
        exit 1
    fi
}

# Wyświetl informacje o deployment
show_deployment_info() {
    log_success "=== DEPLOYMENT ZAKOŃCZONY POMYŚLNIE ==="
    echo
    log_info "Tryb: $MODE"
    log_info "URL: http://localhost:3080"
    echo
    log_info "Przydatne komendy:"
    echo "  docker-compose logs -f          # Pokaż logi"
    echo "  docker-compose ps               # Status kontenerów"
    echo "  docker-compose restart api      # Restart aplikacji"
    echo "  docker-compose down             # Zatrzymaj wszystko"
    echo
    
    if [[ "$MODE" == "development" ]]; then
        log_info "Tryb development - zmiany w kodzie wymagają rebuildu:"
        echo "  npm run frontend                # Rebuild frontendu"
        echo "  docker-compose restart api      # Restart po zmianach"
    fi
    
    echo
    log_info "Enhanced Content Features:"
    echo "  ✓ Multimedia Rendering"
    echo "  ✓ Text-to-Speech"
    echo "  ✓ Charts Support"
    echo "  ✓ Widget System"
    echo "  ✓ Code Execution Preview"
}

# Backup przed deployment (tylko production)
backup_before_deployment() {
    if [[ "$MODE" == "production" ]]; then
        log_info "Tworzę backup przed deployment..."
        
        local backup_dir="backups/$(date +%Y%m%d_%H%M%S)"
        mkdir -p "$backup_dir"
        
        # Backup konfiguracji
        cp .env "$backup_dir/" 2>/dev/null || true
        cp librechat.yaml "$backup_dir/" 2>/dev/null || true
        cp docker-compose.override.yml "$backup_dir/" 2>/dev/null || true
        
        # Backup bazy danych jeśli kontener działa
        if docker-compose ps chat-mongodb | grep -q "Up"; then
            log_info "Tworzę backup bazy danych..."
            docker exec chat-mongodb mongodump --out /tmp/backup 2>/dev/null || true
            docker cp chat-mongodb:/tmp/backup "$backup_dir/mongodb_backup" 2>/dev/null || true
        fi
        
        log_success "Backup utworzony w: $backup_dir"
    fi
}

# Główna funkcja
main() {
    log_info "=== LibreChat Enhanced Content Deployment ==="
    echo
    
    check_requirements
    check_config
    backup_before_deployment
    install_dependencies
    build_frontend
    prepare_docker_config
    stop_containers
    start_containers
    check_deployment
    show_deployment_info
}

# Obsługa sygnałów
trap 'log_error "Deployment przerwany"; exit 1' INT TERM

# Uruchom główną funkcję
main

log_success "Deployment zakończony pomyślnie!"