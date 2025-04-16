# PowerShell script for building and deploying LibreChat to Kubernetes
# Similar to the build-and-deploy.sh script but for Windows

param (
    [string]$ImageName = "librechat-custom",
    [string]$ImageTag = "latest",
    [string]$Registry = "registry.totalsoft.local",
    [string]$Namespace = "librechat",
    [string]$HelmReleaseName = "librechat",
    [string]$RegistryUsername = "docker-registry",
    [string]$RegistryPassword = "docker-registry",
    [hashtable]$Secrets = @{},
    [string]$SecretsPrefix = "SECRET_"
)

$ErrorActionPreference = "Stop"

# Get the script directory and project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Get-Item $ScriptDir).Parent.Parent.FullName

$UtilsPath = Join-Path -Path $ScriptDir -ChildPath "utils\ps-utils.ps1"
. $UtilsPath

# Path to important files
$Dockerfile = Join-Path -Path $ProjectRoot -ChildPath "Dockerfile.multi"
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
if ($RegistryUsername -and $RegistryPassword) {
    Write-Host "Using provided registry credentials" -ForegroundColor Cyan
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

# Login to Docker registry if credentials are provided
if ($RegistryUsername -and $RegistryPassword) {
    Write-Host "Logging in to Docker registry..." -ForegroundColor Cyan
    $secPassword = ConvertTo-SecureString $RegistryPassword -AsPlainText -Force
    $credential = New-Object System.Management.Automation.PSCredential($RegistryUsername, $secPassword)
    docker login $Registry -u $credential.UserName -p $credential.GetNetworkCredential().Password
}

# Build the Docker image using the custom Dockerfile
Write-Host "Building Docker image..." -ForegroundColor Cyan
docker build -t "$Registry/$ImageName`:$ImageTag" -f "$Dockerfile" .

# Push the image to the registry
Write-Host "Pushing Docker image to registry..." -ForegroundColor Cyan
docker push "$Registry/$ImageName`:$ImageTag"

# Create the namespace if it doesn't exist
Write-Host "Creating namespace if it doesn't exist..." -ForegroundColor Cyan
kubectl create namespace $Namespace --dry-run=client -o yaml | kubectl apply -f -

# Create Docker registry secret if credentials are provided
$RegistrySecretParam = ""
if ($RegistryUsername -and $RegistryPassword) {
    Write-Host "Creating Docker registry secret..." -ForegroundColor Cyan
    $secretName = "regcred-$((Get-Date).ToString('yyyyMMdd'))"
    $secretCmd = "kubectl create secret docker-registry $secretName --namespace $Namespace --docker-server=$Registry --docker-username=$RegistryUsername --docker-password=$RegistryPassword --dry-run=client -o yaml"
    Invoke-Expression "$secretCmd | kubectl apply -f -"
    
    # Add the image pull secret to Helm
    $RegistrySecretParam = "--set imagePullSecrets[0].name=$secretName"
}

# Create application secrets dynamically
Write-Host "Creating LibreChat application secrets..." -ForegroundColor Cyan
$secretValues = @{}

# Method 1: Collect secrets from parameters passed directly to the script
if ($Secrets.Count -gt 0) {
    foreach ($key in $Secrets.Keys) {
        if ($Secrets[$key]) {
            $secretValues[$key] = $Secrets[$key]
        }
    }
}

# Method 2: Collect secrets from environment variables with the specified prefix
$envSecrets = Get-ChildItem env: | Where-Object { $_.Name.StartsWith($SecretsPrefix) }
foreach ($envSecret in $envSecrets) {
    $secretKey = $envSecret.Name.Substring($SecretsPrefix.Length)
    $secretValues[$secretKey] = $envSecret.Value
}

# Create the Kubernetes secret if we have any values
if ($secretValues.Count -gt 0) {
    $appSecretName = "librechat-secrets"
    $secretYaml = "apiVersion: v1`nkind: Secret`nmetadata:`n  name: $appSecretName`n  namespace: $Namespace`ntype: Opaque`ndata:`n"
    
    foreach ($key in $secretValues.Keys) {
        $value = $secretValues[$key]
        
        # Only encode if not already Base64 encoded
        if (-not (Test-IsBase64 $value)) {
            $encodedValue = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($value))
        }
        else {
            $encodedValue = $value
            Write-Host "Value for $key is already Base64 encoded" -ForegroundColor Yellow
        }
        
        $secretYaml += "  $key`: $encodedValue`n"
    }
    
    $secretYaml | kubectl apply -f -
    Write-Host "Created '$appSecretName' with $($secretValues.Count) values" -ForegroundColor Green
}

# Create TLS secret directly with kubectl
$CertFile = Join-Path -Path $ProjectRoot -ChildPath "custom\cert\wildcard-totalsoft.crt"
$KeyFile = Join-Path -Path $ProjectRoot -ChildPath "custom\cert\wildcard-totalsoft.key"

if ((Test-Path $CertFile) -and (Test-Path $KeyFile)) {
    Write-Host "Creating TLS secret for ingress..." -ForegroundColor Cyan
    $tlsSecretName = "totalsoft-wildcard-tls"
    $secretCmd = "kubectl create secret tls $tlsSecretName --namespace $Namespace --cert=`"$CertFile`" --key=`"$KeyFile`" --dry-run=client -o yaml"
    Invoke-Expression "$secretCmd | kubectl apply -f -"
    Write-Host "TLS secret '$tlsSecretName' created successfully" -ForegroundColor Green
}
else {
    Write-Host "TLS certificate files not found at $CertFile and $KeyFile" -ForegroundColor Yellow
    Write-Host "Continuing without TLS configuration" -ForegroundColor Yellow
}

# Create ConfigMap for librechat.yaml configuration
Write-Host "Creating LibreChat configuration ConfigMap..." -ForegroundColor Cyan
$LibreChatConfigPath = Join-Path -Path $ProjectRoot -ChildPath "custom\config\k8s\configmaps\librechat.totalsoft.yaml"
kubectl create configmap librechat-config --from-file=librechat.yaml="$LibreChatConfigPath" -n $Namespace --dry-run=client -o yaml | kubectl apply -f -

# Deploy or upgrade using Helm
Write-Host "Deploying to Kubernetes using Helm..." -ForegroundColor Cyan

$helmCmd = "helm upgrade --install $HelmReleaseName `"$HelmChart`" " + `
           "--namespace $Namespace " + `
           "-f `"$CustomValues`" " + `
           "--set `"image.repository=$Registry/$ImageName`" " + `
           "--set `"image.tag=$ImageTag`" " + `
           "--set `"envFrom[0].secretRef.name=librechat-secrets`" " + `
           "--force"

if ($RegistrySecretParam) {
    $helmCmd = "$helmCmd $RegistrySecretParam"
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