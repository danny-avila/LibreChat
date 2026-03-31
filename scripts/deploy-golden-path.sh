#!/bin/bash
# deploy-golden-path.sh - Full LibreChat deployment to OpenShift
#
# Consolidates: namespace setup, SCC grants, secrets, configmap, helm deploy,
# route creation, admin user creation, and agent import into a single
# idempotent script.
#
# Usage:
#   ./scripts/deploy-golden-path.sh --admin-email admin@example.com
#   ./scripts/deploy-golden-path.sh --admin-email admin@example.com --agents-file agents-export.json --make-public
#   ./scripts/deploy-golden-path.sh --dry-run --admin-email admin@example.com

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
START_TIME=$(date +%s)

# -- Colors ------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()   { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $*"; }
ok()    { echo -e "${GREEN}  OK:${NC} $*"; }
warn()  { echo -e "${YELLOW}  WARN:${NC} $*"; }
err()   { echo -e "${RED}  ERROR:${NC} $*" >&2; }
phase() { echo -e "\n${YELLOW}=== $* ===${NC}"; }

# -- Defaults ----------------------------------------------------------------
NAMESPACE="librechat-fips"
ADMIN_EMAIL=""
ADMIN_NAME=""
AGENTS_FILE=""
MAKE_PUBLIC=""
IMAGE_REGISTRY="ghcr.io"
IMAGE_REPO="danny-avila/librechat"
IMAGE_TAG=""
DRY_RUN=false
SKIP_AGENTS=false
SKIP_USER=false

# -- Argument parsing --------------------------------------------------------
usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Required:
  --admin-email EMAIL       Email for the admin user

Optional:
  --namespace NS            OpenShift namespace (default: librechat-fips)
  --admin-name NAME         Display name for admin (default: email prefix)
  --agents-file PATH        Path to agents-export.json for import
  --make-public             Make imported agents publicly visible
  --image-registry REG      Container image registry (default: ghcr.io)
  --image-repo REPO         Container image repository (default: danny-avila/librechat)
  --image-tag TAG           Container image tag (default: Chart.appVersion)
  --dry-run                 Show what would be done without making changes
  --skip-agents             Skip agent import even if --agents-file is set
  --skip-user               Skip admin user creation
  -h, --help                Show this help
EOF
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --namespace)      NAMESPACE="$2";       shift 2 ;;
    --admin-email)    ADMIN_EMAIL="$2";     shift 2 ;;
    --admin-name)     ADMIN_NAME="$2";      shift 2 ;;
    --agents-file)    AGENTS_FILE="$2";     shift 2 ;;
    --make-public)    MAKE_PUBLIC="--make-public"; shift ;;
    --image-registry) IMAGE_REGISTRY="$2";  shift 2 ;;
    --image-repo)     IMAGE_REPO="$2";      shift 2 ;;
    --image-tag)      IMAGE_TAG="$2";       shift 2 ;;
    --dry-run)        DRY_RUN=true;         shift ;;
    --skip-agents)    SKIP_AGENTS=true;     shift ;;
    --skip-user)      SKIP_USER=true;       shift ;;
    -h|--help)        usage 0 ;;
    *)                err "Unknown option: $1"; usage 1 ;;
  esac
done

if [[ -z "$ADMIN_EMAIL" ]]; then
  err "--admin-email is required"
  usage 1
fi

ADMIN_NAME="${ADMIN_NAME:-${ADMIN_EMAIL%%@*}}"

# -- Prerequisite checks ----------------------------------------------------
phase "Checking prerequisites"

for tool in oc helm python3; do
  if ! command -v "$tool" &>/dev/null; then
    err "$tool is not installed or not in PATH"
    exit 1
  fi
done
ok "CLI tools present (oc, helm, python3)"

if ! oc whoami &>/dev/null; then
  err "Not logged into an OpenShift cluster (run 'oc login' first)"
  exit 1
fi
ok "Logged into OpenShift as $(oc whoami)"

if [[ ! -f "$REPO_ROOT/.env" ]]; then
  err ".env file not found at $REPO_ROOT/.env"
  exit 1
fi
ok ".env file found"

if [[ ! -f "$REPO_ROOT/librechat.yaml" ]]; then
  err "librechat.yaml not found at $REPO_ROOT/librechat.yaml"
  exit 1
fi
ok "librechat.yaml found"

if [[ -n "$AGENTS_FILE" && ! -f "$AGENTS_FILE" ]]; then
  err "Agents file not found: $AGENTS_FILE"
  exit 1
fi

# Auto-detect cluster domain
CLUSTER_DOMAIN="$(oc whoami --show-server | sed 's|https://api\.||' | sed 's|:6443||')"
ROUTE_HOST="librechat-${NAMESPACE}.apps.${CLUSTER_DOMAIN}"

log "Namespace:  $NAMESPACE"
log "Cluster:    $CLUSTER_DOMAIN"
log "Route host: $ROUTE_HOST"
log "Image:      ${IMAGE_REGISTRY}/${IMAGE_REPO}:${IMAGE_TAG:-<chart-default>}"

if $DRY_RUN; then
  phase "DRY RUN - no changes will be made"
  echo "Would: create namespace $NAMESPACE"
  echo "Would: grant anyuid SCC to service accounts"
  echo "Would: create secret librechat-credentials-env from .env"
  echo "Would: create configmap librechat-config from librechat.yaml"
  echo "Would: helm install/upgrade librechat"
  echo "Would: create edge route -> librechat-librechat:3080"
  $SKIP_USER  || echo "Would: create admin user $ADMIN_EMAIL"
  if [[ -n "$AGENTS_FILE" ]] && ! $SKIP_AGENTS; then
    echo "Would: import agents from $AGENTS_FILE"
    [[ -n "$MAKE_PUBLIC" ]] && echo "Would: make agents public"
  fi
  exit 0
fi

# -- Phase 1: Deploy --------------------------------------------------------
phase "Phase 1: Deploy"

# 1. Namespace
log "Creating namespace (if needed)..."
if oc get namespace "$NAMESPACE" &>/dev/null; then
  ok "Namespace $NAMESPACE already exists"
else
  oc new-project "$NAMESPACE" \
    --display-name="LibreChat FIPS" \
    --description="LibreChat with FIPS compliance"
  ok "Created namespace $NAMESPACE"
fi

# 2. SCC grants
log "Granting anyuid SCC to service accounts..."
for sa in default librechat-librechat librechat-mongodb librechat-meilisearch; do
  oc adm policy add-scc-to-user anyuid -z "$sa" -n "$NAMESPACE" 2>/dev/null || true
done
ok "SCC permissions granted"

# 3. Credentials secret (delete + recreate for idempotency)
log "Creating credentials secret..."
# shellcheck disable=SC1091
source "$REPO_ROOT/.env"
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
ok "Secret created"

# 4. ConfigMap (delete + recreate for idempotency)
log "Creating librechat-config ConfigMap..."
oc delete configmap librechat-config -n "$NAMESPACE" 2>/dev/null || true
oc create configmap librechat-config \
  --from-file=librechat.yaml="$REPO_ROOT/librechat.yaml" -n "$NAMESPACE"
ok "ConfigMap created"

# 5. Prepare Helm values with patched domain and image settings
log "Preparing Helm values..."
TMP_VALUES=$(mktemp)
trap 'rm -f "$TMP_VALUES"' EXIT

sed \
  -e "s|DOMAIN_SERVER:.*|DOMAIN_SERVER: \"https://${ROUTE_HOST}\"|g" \
  -e "s|DOMAIN_CLIENT:.*|DOMAIN_CLIENT: \"https://${ROUTE_HOST}\"|g" \
  -e "/^  registry:/s|registry:.*|registry: ${IMAGE_REGISTRY}|" \
  -e "/^  repository:/s|repository:.*|repository: ${IMAGE_REPO}|" \
  "$REPO_ROOT/helm/librechat/values-openshift.yaml" > "$TMP_VALUES"

# Patch image tag only if explicitly provided
if [[ -n "$IMAGE_TAG" ]]; then
  sed -i.bak "/^  tag:/s|tag:.*|tag: \"${IMAGE_TAG}\"|" "$TMP_VALUES"
  rm -f "${TMP_VALUES}.bak"
fi
ok "Values prepared"

# 6. Helm install or upgrade
log "Running helm install/upgrade..."
if helm list -n "$NAMESPACE" 2>/dev/null | grep -q librechat; then
  helm upgrade librechat "$REPO_ROOT/helm/librechat" \
    -f "$TMP_VALUES" -n "$NAMESPACE" --timeout 10m
  ok "Helm upgrade complete"
else
  helm install librechat "$REPO_ROOT/helm/librechat" \
    -f "$TMP_VALUES" -n "$NAMESPACE" --timeout 10m
  ok "Helm install complete"
fi

# 7. Route
log "Creating route (if needed)..."
if oc get route librechat -n "$NAMESPACE" &>/dev/null; then
  ok "Route already exists"
else
  oc create route edge librechat \
    --service=librechat-librechat --port=3080 -n "$NAMESPACE"
  ok "Route created"
fi

# 8. Wait for rollout
log "Waiting for deployment rollout (timeout 300s)..."
if oc rollout status deployment/librechat-librechat \
     -n "$NAMESPACE" --timeout=300s; then
  ok "Deployment is ready"
else
  err "Deployment rollout timed out"
  echo "  Check pods: oc get pods -n $NAMESPACE"
  exit 1
fi

ROUTE_URL="$(oc get route librechat -n "$NAMESPACE" \
  -o jsonpath='{.spec.host}' 2>/dev/null || echo "$ROUTE_HOST")"

# -- Phase 2: Admin user ----------------------------------------------------
GENERATED_PASSWORD=""

if $SKIP_USER; then
  phase "Phase 2: Admin user (SKIPPED)"
else
  phase "Phase 2: Admin user"

  # Wait for MongoDB pod
  log "Waiting for MongoDB pod..."
  MONGO_POD=""
  for i in $(seq 1 30); do
    MONGO_POD=$(oc get pods -n "$NAMESPACE" \
      -l app.kubernetes.io/name=mongodb \
      -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
    if [[ -n "$MONGO_POD" ]]; then
      # Verify it's running
      POD_STATUS=$(oc get pod "$MONGO_POD" -n "$NAMESPACE" \
        -o jsonpath='{.status.phase}' 2>/dev/null || true)
      [[ "$POD_STATUS" == "Running" ]] && break
    fi
    sleep 5
  done

  if [[ -z "$MONGO_POD" ]]; then
    err "Could not find a running MongoDB pod after 150s"
    exit 1
  fi
  ok "MongoDB pod: $MONGO_POD"

  # Check if user already exists
  log "Checking for existing user..."
  EXISTING=$(oc exec "$MONGO_POD" -n "$NAMESPACE" -c mongodb -- \
    mongosh --quiet --eval \
    "JSON.stringify(db.users.findOne({email: '${ADMIN_EMAIL}'}))" \
    LibreChat 2>/dev/null || echo "null")

  if [[ "$EXISTING" != "null" && -n "$EXISTING" ]]; then
    ok "User $ADMIN_EMAIL already exists, skipping creation"
  else
    log "Creating admin user $ADMIN_EMAIL..."
    GENERATED_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(16))")

    # Hash the password with bcrypt if available, otherwise warn
    HASHED_PASSWORD=""
    if python3 -c "import bcrypt" 2>/dev/null; then
      HASHED_PASSWORD=$(python3 -c "
import bcrypt
print(bcrypt.hashpw(b'${GENERATED_PASSWORD}', bcrypt.gensalt(10)).decode())
")
    else
      warn "bcrypt not installed locally; user will need to set password via UI"
      warn "Install with: pip install bcrypt"
      # Use a placeholder that will never match, forcing password reset
      HASHED_PASSWORD='$2b$10$PLACEHOLDER_NO_LOGIN_SET_VIA_UI'
    fi

    NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
    USERNAME="${ADMIN_EMAIL%%@*}"

    oc exec "$MONGO_POD" -n "$NAMESPACE" -c mongodb -- \
      mongosh --quiet --eval "
        db.users.insertOne({
          name: '${ADMIN_NAME}',
          username: '${USERNAME}',
          email: '${ADMIN_EMAIL}',
          emailVerified: true,
          password: '${HASHED_PASSWORD}',
          avatar: null,
          provider: 'local',
          role: 'ADMIN',
          plugins: [],
          createdAt: ISODate('${NOW}'),
          updatedAt: ISODate('${NOW}')
        })
      " LibreChat
    ok "Admin user created"
  fi
fi

# -- Phase 3: Agent import --------------------------------------------------
if [[ -z "$AGENTS_FILE" ]] || $SKIP_AGENTS; then
  phase "Phase 3: Agent import (SKIPPED)"
else
  phase "Phase 3: Agent import"

  # Ensure we have the MongoDB pod name
  if [[ -z "${MONGO_POD:-}" ]]; then
    MONGO_POD=$(oc get pods -n "$NAMESPACE" \
      -l app.kubernetes.io/name=mongodb \
      -o jsonpath='{.items[0].metadata.name}')
  fi

  # Get the admin user's ObjectId for agent ownership
  log "Looking up admin user ID..."
  USER_ID=$(oc exec "$MONGO_POD" -n "$NAMESPACE" -c mongodb -- \
    mongosh --quiet --eval \
    "let u = db.users.findOne({email: '${ADMIN_EMAIL}'}); print(u ? u._id.toString() : '')" \
    LibreChat 2>/dev/null || true)

  if [[ -z "$USER_ID" ]]; then
    err "Could not find user $ADMIN_EMAIL in MongoDB; cannot import agents"
    exit 1
  fi
  ok "User ID: $USER_ID"

  # Step 1: Run migrate-agents.py for standard-size agents
  log "Importing agents via migrate-agents.py..."
  python3 "$REPO_ROOT/scripts/migrate-agents.py" \
    --agents "$AGENTS_FILE" \
    --new-user-email "$ADMIN_EMAIL" \
    --new-user-name "$ADMIN_NAME" \
    $MAKE_PUBLIC \
    --target-namespace "$NAMESPACE" || warn "Some agents may have failed (expected for large ones)"

  # Step 2: Import large agents that exceeded command-line limits
  log "Importing large agents via import-large-agent.py..."
  AUTHOR_NAME_ARG="$ADMIN_NAME"
  PUBLIC_FLAG=""
  [[ -n "$MAKE_PUBLIC" ]] && PUBLIC_FLAG="--public"

  python3 "$REPO_ROOT/scripts/import-large-agent.py" \
    "$NAMESPACE" "$MONGO_POD" "$AGENTS_FILE" \
    "$USER_ID" "$AUTHOR_NAME_ARG" $PUBLIC_FLAG || warn "Some large agents may have failed"

  # Step 3: Backfill public ACL entries for agents that are missing them
  if [[ -n "$MAKE_PUBLIC" ]]; then
    log "Backfilling public ACL entries for agents without them..."
    oc exec "$MONGO_POD" -n "$NAMESPACE" -c mongodb -- \
      mongosh --quiet --eval "
        const agents = db.agents.find({}, {_id: 1, id: 1, name: 1}).toArray();
        let created = 0;
        for (const agent of agents) {
          const existing = db.aclentries.findOne({
            resourceType: 'agent',
            resourceId: agent._id,
            principalType: 'public'
          });
          if (!existing) {
            db.aclentries.insertOne({
              principalType: 'public',
              resourceType: 'agent',
              resourceId: agent._id,
              permBits: 1,
              grantedBy: ObjectId('${USER_ID}'),
              grantedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date()
            });
            created++;
            print('  Created ACL for: ' + agent.name);
          }
        }
        print('Backfilled ' + created + ' ACL entries');
      " LibreChat
    ok "ACL backfill complete"
  fi
fi

# -- Phase 4: Verify --------------------------------------------------------
phase "Phase 4: Verify"

# Health check
log "Checking health endpoint..."
HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" \
  "https://${ROUTE_URL}/health" 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" == "200" ]]; then
  ok "Health check passed (HTTP $HTTP_CODE)"
else
  warn "Health check returned HTTP $HTTP_CODE (app may still be starting)"
fi

# Count agents and ACL entries
if [[ -n "${MONGO_POD:-}" ]]; then
  AGENT_COUNT=$(oc exec "$MONGO_POD" -n "$NAMESPACE" -c mongodb -- \
    mongosh --quiet --eval "db.agents.countDocuments()" LibreChat 2>/dev/null || echo "?")
  ACL_COUNT=$(oc exec "$MONGO_POD" -n "$NAMESPACE" -c mongodb -- \
    mongosh --quiet --eval "db.aclentries.countDocuments()" LibreChat 2>/dev/null || echo "?")
  ok "Agents: $AGENT_COUNT, ACL entries: $ACL_COUNT"
fi

# -- Summary -----------------------------------------------------------------
ELAPSED=$(( $(date +%s) - START_TIME ))

phase "Deployment Summary"
echo ""
echo "  URL:         https://${ROUTE_URL}"
echo "  Namespace:   $NAMESPACE"
echo "  Admin email: $ADMIN_EMAIL"
if [[ -n "$GENERATED_PASSWORD" ]]; then
  echo ""
  echo -e "  ${GREEN}Admin password: ${GENERATED_PASSWORD}${NC}"
  echo "  (save this now -- it will not be shown again)"
fi
if [[ -n "${AGENT_COUNT:-}" ]]; then
  echo "  Agents:      $AGENT_COUNT"
  echo "  ACL entries: $ACL_COUNT"
fi
echo ""
echo "  Completed in ${ELAPSED}s"
echo ""
echo "Useful commands:"
echo "  oc get pods -n $NAMESPACE"
echo "  oc logs -f deployment/librechat-librechat -n $NAMESPACE"
echo "  ./update-librechat-config.sh $NAMESPACE"
