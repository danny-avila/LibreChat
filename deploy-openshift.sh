#!/bin/bash
# Deploy LibreChat to OpenShift
# Usage: ./deploy-openshift.sh [namespace] [cluster-domain]
#
# Prerequisites:
# - oc CLI logged into the cluster
# - helm CLI installed
# - .env file with API keys in the project root

set -e

# Configuration
NAMESPACE="${1:-librechat-fips}"
CLUSTER_DOMAIN="${2:-$(oc whoami --show-server | sed 's|https://api\.||' | sed 's|:6443||')}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}LibreChat OpenShift Deployment${NC}"
echo "================================"
echo "Namespace: $NAMESPACE"
echo "Cluster: $CLUSTER_DOMAIN"
echo ""

# Verify prerequisites
if ! oc whoami &>/dev/null; then
    echo -e "${RED}Error: Not logged into OpenShift cluster${NC}"
    exit 1
fi

if ! command -v helm &>/dev/null; then
    echo -e "${RED}Error: helm CLI not found${NC}"
    exit 1
fi

if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Create .env with required API keys (see .env.example)"
    exit 1
fi

# Load environment variables
source "$SCRIPT_DIR/.env"

# Step 1: Create namespace if it doesn't exist
echo -e "${YELLOW}Step 1: Creating namespace...${NC}"
if oc get namespace "$NAMESPACE" &>/dev/null; then
    echo "Namespace $NAMESPACE already exists"
else
    oc new-project "$NAMESPACE" --display-name="LibreChat FIPS" --description="LibreChat with FIPS compliance"
fi

# Step 2: Grant anyuid SCC to service accounts
echo -e "${YELLOW}Step 2: Granting anyuid SCC...${NC}"
for sa in default librechat-librechat librechat-mongodb librechat-meilisearch; do
    oc adm policy add-scc-to-user anyuid -z "$sa" -n "$NAMESPACE" 2>/dev/null || true
done
echo -e "${GREEN}SCC permissions granted${NC}"

# Step 3: Create or update credentials secret
echo -e "${YELLOW}Step 3: Creating credentials secret...${NC}"
oc delete secret librechat-credentials-env -n "$NAMESPACE" 2>/dev/null || true
oc create secret generic librechat-credentials-env -n "$NAMESPACE" \
    --from-literal=CREDS_KEY="${CREDS_KEY}" \
    --from-literal=CREDS_IV="${CREDS_IV}" \
    --from-literal=JWT_SECRET="${JWT_SECRET}" \
    --from-literal=JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET}" \
    --from-literal=MEILI_MASTER_KEY="${MEILI_MASTER_KEY}" \
    --from-literal=OPENROUTER_KEY="${OPENROUTER_KEY:-dummy}" \
    --from-literal=VLLM_API_KEY="${VLLM_API_KEY:-dummy}" \
    --from-literal=VLLM_API_URL="${VLLM_API_URL:-http://localhost}" \
    --from-literal=ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-dummy}" \
    --from-literal=OPENAI_API_KEY="${OPENAI_API_KEY:-dummy}"
echo -e "${GREEN}Secret created${NC}"

# Step 4: Create or update ConfigMap with librechat.yaml
echo -e "${YELLOW}Step 4: Creating librechat config...${NC}"
oc delete configmap librechat-config -n "$NAMESPACE" 2>/dev/null || true
oc create configmap librechat-config --from-file=librechat.yaml="$SCRIPT_DIR/librechat.yaml" -n "$NAMESPACE"
echo -e "${GREEN}ConfigMap created${NC}"

# Step 5: Update values file with cluster domain
echo -e "${YELLOW}Step 5: Preparing Helm values...${NC}"
ROUTE_HOST="librechat-${NAMESPACE}.apps.${CLUSTER_DOMAIN}"
VALUES_FILE="$SCRIPT_DIR/helm/librechat/values-openshift.yaml"

# Create a temporary values file with updated domain
TMP_VALUES=$(mktemp)
sed "s|DOMAIN_SERVER:.*|DOMAIN_SERVER: \"https://${ROUTE_HOST}\"|g" "$VALUES_FILE" | \
sed "s|DOMAIN_CLIENT:.*|DOMAIN_CLIENT: \"https://${ROUTE_HOST}\"|g" > "$TMP_VALUES"

# Step 6: Deploy with Helm
echo -e "${YELLOW}Step 6: Installing/Upgrading Helm release...${NC}"
if helm list -n "$NAMESPACE" | grep -q librechat; then
    helm upgrade librechat "$SCRIPT_DIR/helm/librechat" -f "$TMP_VALUES" -n "$NAMESPACE" --timeout 10m
else
    helm install librechat "$SCRIPT_DIR/helm/librechat" -f "$TMP_VALUES" -n "$NAMESPACE" --timeout 10m
fi

rm -f "$TMP_VALUES"

# Step 7: Create route if it doesn't exist
echo -e "${YELLOW}Step 7: Creating route...${NC}"
if oc get route librechat -n "$NAMESPACE" &>/dev/null; then
    echo "Route already exists"
else
    oc create route edge librechat --service=librechat-librechat --port=3080 -n "$NAMESPACE"
fi

# Step 8: Wait for pods and verify
echo -e "${YELLOW}Step 8: Waiting for pods to be ready...${NC}"
oc rollout status deployment/librechat-librechat -n "$NAMESPACE" --timeout=180s

# Get the actual route
ROUTE_URL=$(oc get route librechat -n "$NAMESPACE" -o jsonpath='{.spec.host}')

echo ""
echo -e "${GREEN}Deployment complete!${NC}"
echo "================================"
echo -e "URL: ${GREEN}https://${ROUTE_URL}${NC}"
echo ""
echo "Useful commands:"
echo "  View pods:    oc get pods -n $NAMESPACE"
echo "  View logs:    oc logs -f deployment/librechat-librechat -n $NAMESPACE"
echo "  Update config: ./update-librechat-config.sh $NAMESPACE"
