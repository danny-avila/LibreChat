# Postiz Quick Start Script for Windows PowerShell

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Postiz Deployment - Quick Start" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "Checking Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version
    Write-Host "✓ Docker found: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker not found or not running!" -ForegroundColor Red
    Write-Host "Please install Docker Desktop and ensure it's running." -ForegroundColor Red
    exit 1
}

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "✗ .env file not found!" -ForegroundColor Red
    Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "✓ .env file created. Please review and update if needed." -ForegroundColor Green
}

Write-Host ""
Write-Host "Starting Postiz services..." -ForegroundColor Yellow
docker compose up -d

Write-Host ""
Write-Host "Waiting for services to be healthy..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host ""
Write-Host "Checking service status..." -ForegroundColor Yellow
docker compose ps

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Postiz is starting up!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Access Postiz at: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Open http://localhost:3000 in your browser" -ForegroundColor White
Write-Host "2. Create your admin account" -ForegroundColor White
Write-Host "3. Configure social platform integrations" -ForegroundColor White
Write-Host "4. Generate API key for LibreChat" -ForegroundColor White
Write-Host ""
Write-Host "To view logs: docker compose logs -f postiz" -ForegroundColor Gray
Write-Host "To stop: docker compose down" -ForegroundColor Gray
Write-Host ""
