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
    [hashtable]$EnvVars = @{}
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

Write-Host "Creating LibreChat application secrets..." -ForegroundColor Cyan

$appSecretName = "librechat-secrets"
if ($Secrets.Count -gt 0) {
    # Delete the existing secret if it exists
    Write-Host "Deleting existing application secret if it exists..." -ForegroundColor Cyan
    kubectl delete secret $appSecretName --namespace $Namespace --ignore-not-found
    
    Write-Host "Creating Kubernetes Secret '$appSecretName' with $($Secrets.Count) values" -ForegroundColor Cyan
    $secretYaml = "apiVersion: v1`nkind: Secret`nmetadata:`n  name: $appSecretName`n  namespace: $Namespace`ntype: Opaque`ndata:`n"
    
    foreach ($key in $Secrets.Keys) {
        $value = $Secrets[$key]
        
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
    Write-Host "Created '$appSecretName' with $($Secrets.Count) values" -ForegroundColor Green
}

$githubEnvConfigMapName = "$HelmReleaseName-github-env"
if ($EnvVars.Count -gt 0) {
    # Delete the existing ConfigMap if it exists
    Write-Host "Deleting existing environment ConfigMap if it exists..." -ForegroundColor Cyan
    kubectl delete configmap $githubEnvConfigMapName --namespace $Namespace --ignore-not-found
    
    Write-Host "Creating ConfigMap '$githubEnvConfigMapName' with $($EnvVars.Count) environment variables" -ForegroundColor Cyan
    $configMapYaml = "apiVersion: v1`nkind: ConfigMap`nmetadata:`n  name: $githubEnvConfigMapName`n  namespace: $Namespace`ndata:`n"
    
    foreach ($key in $EnvVars.Keys) {
        $value = $EnvVars[$key]
        # Escape double quotes in value if needed
        $escapedValue = $value -replace '"', '\"'
        $configMapYaml += "  $key`: `"$escapedValue`"`n"
    }
    
    $configMapYaml | kubectl apply -f -
    Write-Host "Created '$githubEnvConfigMapName' with $($EnvVars.Count) values" -ForegroundColor Green
}

# Create TLS secret directly with kubectl
$CertFile = Join-Path -Path $ProjectRoot -ChildPath "custom\cert\wildcard-totalsoft.crt"
$KeyFile = Join-Path -Path $ProjectRoot -ChildPath "custom\cert\wildcard-totalsoft.key"

if ((Test-Path $CertFile) -and (Test-Path $KeyFile)) {
    Write-Host "Creating TLS secret for ingress..." -ForegroundColor Cyan
    $tlsSecretName = "totalsoft-wildcard-tls"
    
    # Delete the existing TLS secret if it exists
    Write-Host "Deleting existing TLS secret if it exists..." -ForegroundColor Cyan
    kubectl delete secret $tlsSecretName --namespace $Namespace --ignore-not-found
    
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

# Delete the existing ConfigMap if it exists
Write-Host "Deleting existing LibreChat configuration ConfigMap if it exists..." -ForegroundColor Cyan
kubectl delete configmap librechat-config --namespace $Namespace --ignore-not-found

kubectl create configmap librechat-config --from-file=librechat.yaml="$LibreChatConfigPath" -n $Namespace --dry-run=client -o yaml | kubectl apply -f -

# Deploy or upgrade using Helm
Write-Host "Deploying to Kubernetes using Helm..." -ForegroundColor Cyan

$helmCmd = "helm upgrade --install $HelmReleaseName `"$HelmChart`" " + `
           "--namespace $Namespace " + `
           "-f `"$CustomValues`" " + `
           "--set `"image.repository=$Registry/$ImageName`" " + `
           "--set `"image.tag=$ImageTag`" "

# Add GitHub environment ConfigMap if environment variables were provided
if ($EnvVars.Count -gt 0) {
    $helmCmd += "--set `"config.additionalConfigMaps[0].name=$githubEnvConfigMapName`" "
}

$helmCmd += "--force"

if ($RegistrySecretParam) {
    $helmCmd = "$helmCmd $RegistrySecretParam"
}

Write-Host "Executing Helm command: $helmCmd" -ForegroundColor Yellow
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