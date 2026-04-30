#!/usr/bin/env bash
set -euo pipefail

#=============================================================================
# BilleChat — Azure Infrastructure Provisioning
#
# Creates: Resource Group, ACR, AKS, Ingress Controller, cert-manager, DNS
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - kubectl installed
#   - helm installed
#
# Usage:
#   chmod +x deploy/azure/setup-infrastructure.sh
#   ./deploy/azure/setup-infrastructure.sh
#=============================================================================

# ── Configuration ──────────────────────────────────────────────────────────
RESOURCE_GROUP="${RESOURCE_GROUP:-billechat-rg}"
LOCATION="${LOCATION:-swedencentral}"
AKS_CLUSTER="${AKS_CLUSTER:-billechat-aks}"
ACR_NAME="${ACR_NAME:-billechatacr}"
NODE_COUNT="${NODE_COUNT:-2}"
NODE_VM_SIZE="${NODE_VM_SIZE:-Standard_D4s_v5}"
K8S_VERSION="${K8S_VERSION:-1.30}"
NAMESPACE="${NAMESPACE:-billechat}"
DOMAIN="${DOMAIN:-billechat.billennium.com}"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║         BilleChat Azure Infrastructure Setup            ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Resource Group : ${RESOURCE_GROUP}"
echo "║  Location       : ${LOCATION}"
echo "║  AKS Cluster    : ${AKS_CLUSTER}"
echo "║  ACR            : ${ACR_NAME}"
echo "║  Namespace      : ${NAMESPACE}"
echo "║  Domain         : ${DOMAIN}"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── 1. Resource Group ─────────────────────────────────────────────────────
echo "▸ Creating resource group..."
az group create \
  --name "${RESOURCE_GROUP}" \
  --location "${LOCATION}" \
  --output none

# ── 2. Azure Container Registry ──────────────────────────────────────────
echo "▸ Creating Azure Container Registry..."
az acr create \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${ACR_NAME}" \
  --sku Standard \
  --output none

ACR_LOGIN_SERVER=$(az acr show --name "${ACR_NAME}" --query loginServer -o tsv)
echo "  ACR server: ${ACR_LOGIN_SERVER}"

# ── 3. AKS Cluster ───────────────────────────────────────────────────────
echo "▸ Creating AKS cluster..."
az aks create \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${AKS_CLUSTER}" \
  --node-count "${NODE_COUNT}" \
  --node-vm-size "${NODE_VM_SIZE}" \
  --kubernetes-version "${K8S_VERSION}" \
  --attach-acr "${ACR_NAME}" \
  --enable-managed-identity \
  --generate-ssh-keys \
  --network-plugin azure \
  --network-policy azure \
  --enable-addons monitoring \
  --output none

# ── 4. Get AKS Credentials ───────────────────────────────────────────────
echo "▸ Fetching kubeconfig..."
az aks get-credentials \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${AKS_CLUSTER}" \
  --overwrite-existing

# ── 5. Create Namespace ──────────────────────────────────────────────────
echo "▸ Creating namespace..."
kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

# ── 6. Install NGINX Ingress Controller ──────────────────────────────────
echo "▸ Installing NGINX Ingress Controller..."
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx 2>/dev/null || true
helm repo update

helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.replicaCount=2 \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"=/healthz \
  --wait

# ── 7. Install cert-manager for TLS ─────────────────────────────────────
echo "▸ Installing cert-manager..."
helm repo add jetstack https://charts.jetstack.io 2>/dev/null || true
helm repo update

helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set crds.enabled=true \
  --wait

# Create ClusterIssuer for Let's Encrypt
echo "▸ Creating Let's Encrypt ClusterIssuer..."
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: devops@billennium.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF

# ── 8. Get Ingress External IP ───────────────────────────────────────────
echo "▸ Waiting for Ingress external IP..."
EXTERNAL_IP=""
for i in $(seq 1 30); do
  EXTERNAL_IP=$(kubectl get svc ingress-nginx-controller \
    -n ingress-nginx \
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
  if [[ -n "${EXTERNAL_IP}" ]]; then
    break
  fi
  echo "  Waiting... (${i}/30)"
  sleep 10
done

# ── 9. Summary ───────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              Infrastructure Ready!                      ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  ACR Login Server : ${ACR_LOGIN_SERVER}"
echo "║  AKS Cluster      : ${AKS_CLUSTER}"
echo "║  Ingress IP       : ${EXTERNAL_IP:-PENDING}"
echo "║  Namespace        : ${NAMESPACE}"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                         ║"
echo "║  Next Steps:                                            ║"
echo "║  1. Point DNS A record for ${DOMAIN}"
echo "║     to ${EXTERNAL_IP:-<ingress-ip>}"
echo "║  2. Run: ./deploy/azure/create-secrets.sh               ║"
echo "║  3. Push to billechat branch to trigger deployment      ║"
echo "║                                                         ║"
echo "║  To set up GitHub Actions secrets, run:                 ║"
echo "║  ./deploy/azure/setup-github-secrets.sh                 ║"
echo "╚══════════════════════════════════════════════════════════╝"
