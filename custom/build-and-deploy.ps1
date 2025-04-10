# PowerShell script for building and deploying LibreChat to Kubernetes
# Similar to the build-and-deploy.sh script but for Windows

param (
    [string]$ImageName = "librechat-custom",
    [string]$ImageTag = "latest",
    [string]$Registry = "registry.totalsoft.local",
    [string]$Namespace = "librechat",
    [string]$HelmReleaseName = "librechat",
    [string]$MongoUri = ""
)

$ErrorActionPreference = "Stop"

# Get the script directory and project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Get-Item $ScriptDir).Parent.FullName

# Path to important files
$Dockerfile = Join-Path -Path $ProjectRoot -ChildPath "Dockerfile.custom"
$CustomValues = Join-Path -Path $ProjectRoot -ChildPath "custom\config\k8s\custom-values.yaml"
$HelmChart = Join-Path -Path $ProjectRoot -ChildPath "charts\librechat"

Write-Host "Building and deploying LibreChat custom image" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Green
Write-Host "Image: $Registry/$ImageName`:$ImageTag"
Write-Host "Namespace: $Namespace"
Write-Host "Helm Release: $HelmReleaseName"
Write-Host "Project root: $ProjectRoot"
Write-Host "Dockerfile: $Dockerfile"
Write-Host "Values file: $CustomValues"
Write-Host "Helm chart: $HelmChart"
if ($MongoUri) {
    Write-Host "Using custom MongoDB URI" -ForegroundColor Cyan
} else {
    Write-Host "Using MongoDB URI from custom-values.yaml" -ForegroundColor Cyan
}
Write-Host "===============================================" -ForegroundColor Green

# Check if Dockerfile exists
if (-not (Test-Path $Dockerfile)) {
    Write-Host "Error: Dockerfile not found at $Dockerfile" -ForegroundColor Red
    exit 1
}

# Check if custom values file exists
if (-not (Test-Path $CustomValues)) {
    Write-Host "Error: Custom values file not found at $CustomValues" -ForegroundColor Red
    exit 1
}

# Check if Helm chart exists
if (-not (Test-Path $HelmChart)) {
    Write-Host "Error: Helm chart not found at $HelmChart" -ForegroundColor Red
    exit 1
}

# Change to project root
Set-Location -Path $ProjectRoot

# Build the Docker image using the custom Dockerfile
Write-Host "Building Docker image..." -ForegroundColor Cyan
docker build -t "$Registry/$ImageName`:$ImageTag" -f "$Dockerfile" .

# Push the image to the registry
Write-Host "Pushing Docker image to registry..." -ForegroundColor Cyan
docker push "$Registry/$ImageName`:$ImageTag"

# Create the namespace if it doesn't exist
Write-Host "Creating namespace if it doesn't exist..." -ForegroundColor Cyan
kubectl create namespace $Namespace --dry-run=client -o yaml | kubectl apply -f -

# Create MongoDB credentials secret if a URI is provided
$MongoParam = ""
if ($MongoUri) {
    Write-Host "Creating MongoDB credentials secret..." -ForegroundColor Cyan
    $secretCmd = "kubectl create secret generic mongodb-credentials --namespace $Namespace --from-literal=connection-string=`"$MongoUri`" --dry-run=client -o yaml"
    Invoke-Expression "$secretCmd | kubectl apply -f -"
    
    # Add the MongoDB URI secret reference to Helm
    $MongoParam = "--set env[1].name=MONGO_URI,env[1].valueFrom.secretKeyRef.name=mongodb-credentials,env[1].valueFrom.secretKeyRef.key=connection-string"
}

# Deploy or upgrade using Helm
Write-Host "Deploying to Kubernetes using Helm..." -ForegroundColor Cyan

$helmCmd = "helm upgrade --install $HelmReleaseName `"$HelmChart`" " + `
           "--namespace $Namespace " + `
           "-f `"$CustomValues`" " + `
           "--set `"image.repository=$Registry/$ImageName`" " + `
           "--set `"image.tag=$ImageTag`""

if ($MongoParam) {
    $helmCmd = "$helmCmd $MongoParam"
}

Invoke-Expression $helmCmd

Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Green
Write-Host "To check the status of your deployment:"
Write-Host "kubectl get pods -n $Namespace" -ForegroundColor Yellow
Write-Host ""
Write-Host "To access the application:"
Write-Host "kubectl port-forward svc/$HelmReleaseName -n $Namespace 3080:3080" -ForegroundColor Yellow
Write-Host "Then visit: http://localhost:3080"
Write-Host "===============================================" -ForegroundColor Green 