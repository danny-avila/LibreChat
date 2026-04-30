#!/usr/bin/env bash
set -euo pipefail

#=============================================================================
# BilleChat — GitHub Actions Secrets & Azure Service Principal Setup
#
# Creates an Azure Service Principal for GitHub Actions and prints
# the required secrets to configure in GitHub repository settings.
#
# Prerequisites:
#   - Azure CLI logged in with Owner/Contributor on the subscription
#   - gh CLI authenticated (optional, for auto-setting secrets)
#
# Usage:
#   chmod +x deploy/azure/setup-github-secrets.sh
#   ./deploy/azure/setup-github-secrets.sh
#=============================================================================

RESOURCE_GROUP="${RESOURCE_GROUP:-billechat-rg}"
ACR_NAME="${ACR_NAME:-billechatacr}"
AKS_CLUSTER="${AKS_CLUSTER:-billechat-aks}"
SP_NAME="${SP_NAME:-billechat-github-actions}"

echo "▸ Getting subscription info..."
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
echo "  Subscription: ${SUBSCRIPTION_ID}"

# ── 1. Create Service Principal ──────────────────────────────────────────
echo "▸ Creating Service Principal for GitHub Actions..."
SP_OUTPUT=$(az ad sp create-for-rbac \
  --name "${SP_NAME}" \
  --role contributor \
  --scopes "/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}" \
  --sdk-auth)

echo "  Service Principal created."

# ── 2. Get ACR Credentials ──────────────────────────────────────────────
echo "▸ Fetching ACR credentials..."
ACR_LOGIN_SERVER=$(az acr show --name "${ACR_NAME}" --query loginServer -o tsv)
ACR_USERNAME=$(az acr credential show --name "${ACR_NAME}" --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name "${ACR_NAME}" --query "passwords[0].value" -o tsv)

# ── 3. Generate App Secrets ─────────────────────────────────────────────
echo "▸ Generating application secrets..."
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
CREDS_KEY=$(openssl rand -hex 32)
CREDS_IV=$(openssl rand -hex 16)
OPENID_SESSION_SECRET=$(openssl rand -hex 16)
MEILI_MASTER_KEY=$(openssl rand -hex 16)

# ── 4. Output ────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       GitHub Actions Secrets — Add to Repository Settings   ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Settings > Secrets and variables > Actions > New secret    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "──── Azure Credentials ────"
echo "AZURE_CREDENTIALS:"
echo "${SP_OUTPUT}"
echo ""
echo "ACR_LOGIN_SERVER=${ACR_LOGIN_SERVER}"
echo "ACR_USERNAME=${ACR_USERNAME}"
echo "ACR_PASSWORD=${ACR_PASSWORD}"
echo ""
echo "──── Application Secrets ────"
echo "JWT_SECRET=${JWT_SECRET}"
echo "JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}"
echo "CREDS_KEY=${CREDS_KEY}"
echo "CREDS_IV=${CREDS_IV}"
echo "OPENID_SESSION_SECRET=${OPENID_SESSION_SECRET}"
echo "MEILI_MASTER_KEY=${MEILI_MASTER_KEY}"
echo ""
echo "──── Secrets from your .env (add manually) ────"
echo "AZURE_AI_FOUNDRY_API_KEY=<from .env>"
echo "OPENID_CLIENT_SECRET=<from .env>"
echo "RAG_OPENAI_API_KEY=<from .env>"
echo "AZURE_OPENAI_API_KEY=<from .env>"
echo ""

# ── 5. Auto-set via gh CLI (optional) ───────────────────────────────────
if command -v gh &>/dev/null; then
  echo "──────────────────────────────────────────────────────────"
  read -rp "Auto-set secrets via 'gh' CLI? (y/N): " AUTOSET
  if [[ "${AUTOSET}" =~ ^[Yy]$ ]]; then
    echo "▸ Setting GitHub secrets..."
    echo "${SP_OUTPUT}" | gh secret set AZURE_CREDENTIALS
    gh secret set ACR_LOGIN_SERVER --body "${ACR_LOGIN_SERVER}"
    gh secret set ACR_USERNAME --body "${ACR_USERNAME}"
    gh secret set ACR_PASSWORD --body "${ACR_PASSWORD}"
    gh secret set JWT_SECRET --body "${JWT_SECRET}"
    gh secret set JWT_REFRESH_SECRET --body "${JWT_REFRESH_SECRET}"
    gh secret set CREDS_KEY --body "${CREDS_KEY}"
    gh secret set CREDS_IV --body "${CREDS_IV}"
    gh secret set OPENID_SESSION_SECRET --body "${OPENID_SESSION_SECRET}"
    gh secret set MEILI_MASTER_KEY --body "${MEILI_MASTER_KEY}"
    echo "  ✓ Auto-set complete. Manually add the remaining secrets from .env."
  fi
fi
