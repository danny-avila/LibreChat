#!/bin/bash
set -e

# Get the absolute path to the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Configuration
IMAGE_NAME=${1:-"librechat-custom"}
IMAGE_TAG=${2:-"latest"}
REGISTRY=${3:-"your-registry"}
NAMESPACE=${4:-"librechat"}
HELM_RELEASE_NAME=${5:-"librechat"}
MONGO_URI=${6:-""}

# Path to important files
DOCKERFILE="${PROJECT_ROOT}/Dockerfile.custom"
CUSTOM_VALUES="${PROJECT_ROOT}/custom/config/k8s/custom-values.yaml"
HELM_CHART="${PROJECT_ROOT}/charts/librechat"

echo "Building and deploying LibreChat custom image"
echo "=============================================="
echo "Image: $REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
echo "Namespace: $NAMESPACE"
echo "Helm Release: $HELM_RELEASE_NAME"
echo "Project root: $PROJECT_ROOT"
echo "Dockerfile: $DOCKERFILE"
echo "Values file: $CUSTOM_VALUES"
echo "Helm chart: $HELM_CHART"
if [ -n "$MONGO_URI" ]; then
  echo "Using custom MongoDB URI"
else
  echo "Using MongoDB URI from custom-values.yaml"
fi
echo "=============================================="

# Check if Dockerfile exists
if [ ! -f "$DOCKERFILE" ]; then
  echo "Error: Dockerfile not found at $DOCKERFILE"
  exit 1
fi

# Check if custom values file exists
if [ ! -f "$CUSTOM_VALUES" ]; then
  echo "Error: Custom values file not found at $CUSTOM_VALUES"
  exit 1
fi

# Check if Helm chart exists
if [ ! -d "$HELM_CHART" ]; then
  echo "Error: Helm chart not found at $HELM_CHART"
  exit 1
fi

# Change to project root
cd "$PROJECT_ROOT"

# Build the Docker image using the custom Dockerfile
echo "Building Docker image..."
docker build -t $REGISTRY/$IMAGE_NAME:$IMAGE_TAG -f "$DOCKERFILE" .

# Push the image to the registry
echo "Pushing Docker image to registry..."
docker push $REGISTRY/$IMAGE_NAME:$IMAGE_TAG

# Create the namespace if it doesn't exist
echo "Creating namespace if it doesn't exist..."
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Create MongoDB credentials secret if a URI is provided
if [ -n "$MONGO_URI" ]; then
  echo "Creating MongoDB credentials secret..."
  kubectl create secret generic mongodb-credentials \
    --namespace $NAMESPACE \
    --from-literal=connection-string="$MONGO_URI" \
    --dry-run=client -o yaml | kubectl apply -f -
  
  # Add the MongoDB URI secret reference to Helm
  MONGO_PARAM="--set env[1].name=MONGO_URI,env[1].valueFrom.secretKeyRef.name=mongodb-credentials,env[1].valueFrom.secretKeyRef.key=connection-string"
else
  MONGO_PARAM=""
fi

# Deploy or upgrade using Helm
echo "Deploying to Kubernetes using Helm..."
helm upgrade --install $HELM_RELEASE_NAME "$HELM_CHART" \
  --namespace $NAMESPACE \
  -f "$CUSTOM_VALUES" \
  --set image.repository=$REGISTRY/$IMAGE_NAME \
  --set image.tag=$IMAGE_TAG \
  $MONGO_PARAM

echo "Deployment complete!"
echo "=============================================="
echo "To check the status of your deployment:"
echo "kubectl get pods -n $NAMESPACE"
echo ""
echo "To access the application:"
echo "kubectl port-forward svc/$HELM_RELEASE_NAME -n $NAMESPACE 3080:3080"
echo "Then visit: http://localhost:3080"
echo "==============================================" 