#!/bin/bash

# Set the KUBECONFIG relative to this script's location
export KUBECONFIG="$(dirname "$0")/kubeconfig.yml"

echo "Fetching Kubernetes Dashboard Token..."
echo "----------------------------------------"
kubectl -n kubernetes-dashboard get secret admin-user-token -o jsonpath='{.data.token}' | base64 --decode
echo ""
echo "----------------------------------------"
echo "Copy the token above to log in."
